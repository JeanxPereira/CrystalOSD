// Batch export decompiled C from Ghidra for all unmatched functions
// Reads asm/ to discover pending functions, uses symbol_addrs.txt for addresses,
// skips functions already decompiled in src/, exports to src/stubs/<subsystem>/
// @category OSDSYS
// @author CrystalOSD

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import java.io.*;
import java.util.*;
import java.util.regex.*;

public class BatchExportToC extends GhidraScript {

    // Matches: name = 0xADDRESS; // size:0xXX type:func
    private static final Pattern SYM_PATTERN = Pattern.compile(
        "^\\s*([\\w.]+)\\s*=\\s*0x([0-9a-fA-F]+)\\s*;(.*)$"
    );
    private static final Pattern TYPE_PATTERN = Pattern.compile("type:(\\w+)");

    @Override
    protected void run() throws Exception {
        // Ask for the CrystalOSD project root
        File projectRoot = askDirectory("Select CrystalOSD project root", "Select");
        if (projectRoot == null) return;

        File asmDir = new File(projectRoot, "asm");
        File srcDir = new File(projectRoot, "src");
        File stubsDir = new File(projectRoot, "src/stubs");
        File symFile = new File(projectRoot, "symbol_addrs.txt");

        if (!asmDir.exists()) {
            printerr("ERROR: asm/ directory not found at " + asmDir.getAbsolutePath());
            return;
        }
        if (!symFile.exists()) {
            printerr("ERROR: symbol_addrs.txt not found at " + symFile.getAbsolutePath());
            return;
        }

        // Step 1: Build symbol_addrs.txt lookup (name -> address hex string)
        println("=== Step 1: Parsing symbol_addrs.txt ===");
        Map<String, String> symbolAddrs = new LinkedHashMap<>();
        BufferedReader symReader = new BufferedReader(new FileReader(symFile));
        String line;
        while ((line = symReader.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) continue;
            Matcher m = SYM_PATTERN.matcher(line);
            if (!m.matches()) continue;
            String name = m.group(1);
            String addrHex = m.group(2);
            String comment = m.group(3);
            // Only index functions
            if (comment != null) {
                Matcher tm = TYPE_PATTERN.matcher(comment);
                if (tm.find() && tm.group(1).equals("func")) {
                    symbolAddrs.put(name, addrHex);
                }
            }
        }
        symReader.close();
        println("  Indexed " + symbolAddrs.size() + " function symbols");

        // Step 2: Discover all .s files in asm/ (subsystem -> [funcName, ...])
        println("=== Step 2: Scanning asm/ for pending functions ===");
        Map<String, List<String>> asmFunctions = new LinkedHashMap<>();
        int totalAsm = 0;
        int skippedNoName = 0;
        File[] subsysDirs = asmDir.listFiles(File::isDirectory);
        if (subsysDirs == null) {
            printerr("ERROR: No subsystem directories in asm/");
            return;
        }
        Arrays.sort(subsysDirs);
        for (File subsysDir : subsysDirs) {
            String subsystem = subsysDir.getName();
            File[] asmFiles = subsysDir.listFiles((dir, name) -> name.endsWith(".s"));
            if (asmFiles == null || asmFiles.length == 0) continue;
            Arrays.sort(asmFiles);

            List<String> funcs = new ArrayList<>();
            for (File asmFile : asmFiles) {
                String funcName = asmFile.getName().replace(".s", "");
                // Skip unnamed/gap functions — they produce useless decompiler output
                if (funcName.startsWith("FUN_") || funcName.startsWith("gap_") ||
                    funcName.startsWith("j_") || funcName.startsWith("data_")) {
                    skippedNoName++;
                    continue;
                }
                funcs.add(funcName);
                totalAsm++;
            }
            if (!funcs.isEmpty()) {
                asmFunctions.put(subsystem, funcs);
            }
        }
        println("  Found " + totalAsm + " named functions across " +
                asmFunctions.size() + " subsystems (skipped " + skippedNoName + " FUN_/gap_/j_/data_)");

        // Step 3: Check which functions already have .c files in src/
        println("=== Step 3: Filtering already-decompiled functions ===");
        Set<String> alreadyDecompiled = new HashSet<>();
        scanForCFiles(srcDir, alreadyDecompiled);
        // Also check src/stubs/ to avoid re-exporting
        if (stubsDir.exists()) {
            scanForCFiles(stubsDir, alreadyDecompiled);
        }
        println("  Found " + alreadyDecompiled.size() + " already-decompiled functions");

        // Step 4: Set up decompiler
        println("=== Step 4: Initializing decompiler ===");
        DecompInterface decompiler = new DecompInterface();
        DecompileOptions options = new DecompileOptions();
        decompiler.setOptions(options);
        if (!decompiler.openProgram(currentProgram)) {
            printerr("ERROR: Failed to open program in decompiler");
            return;
        }

        AddressFactory addressFactory = currentProgram.getAddressFactory();
        Listing listing = currentProgram.getListing();

        // Step 5: Export!
        println("=== Step 5: Batch exporting decompiled C ===");
        int exported = 0;
        int skippedAlready = 0;
        int skippedNoAddr = 0;
        int skippedNoFunc = 0;
        int decompFailed = 0;

        for (Map.Entry<String, List<String>> entry : asmFunctions.entrySet()) {
            String subsystem = entry.getKey();
            List<String> funcs = entry.getValue();

            File outDir = new File(stubsDir, subsystem);

            for (String funcName : funcs) {
                // Skip if already decompiled in src/
                if (alreadyDecompiled.contains(funcName)) {
                    skippedAlready++;
                    continue;
                }

                // Look up address from symbol_addrs.txt
                String addrHex = symbolAddrs.get(funcName);
                if (addrHex == null) {
                    skippedNoAddr++;
                    continue;
                }

                // Find function in Ghidra
                Address addr = addressFactory.getAddress(addrHex);
                if (addr == null) {
                    skippedNoAddr++;
                    continue;
                }
                Function func = listing.getFunctionAt(addr);
                if (func == null) {
                    skippedNoFunc++;
                    continue;
                }

                // Decompile
                DecompileResults results = decompiler.decompileFunction(func, 30, monitor);
                if (results == null || !results.decompileCompleted() ||
                    results.getDecompiledFunction() == null) {
                    decompFailed++;
                    continue;
                }

                String cCode = results.getDecompiledFunction().getC();
                if (cCode == null || cCode.trim().isEmpty()) {
                    decompFailed++;
                    continue;
                }

                // Create output directory if needed
                if (!outDir.exists()) {
                    outDir.mkdirs();
                }

                // Write stub file
                File outFile = new File(outDir, funcName + ".c");
                PrintWriter writer = new PrintWriter(new FileWriter(outFile));
                writer.println("/* CrystalOSD — " + capitalize(subsystem) + " subsystem: " + funcName);
                writer.println(" *");
                writer.println(" * 0x" + addrHex.toUpperCase());
                writer.println(" * STUB — Ghidra decompiler output, needs manual cleanup");
                writer.println(" */");
                writer.println();
                writer.print(cCode);
                writer.close();

                exported++;

                // Progress every 50 functions
                if (exported % 50 == 0) {
                    println("  ... exported " + exported + " so far");
                }

                // Check for cancellation
                if (monitor.isCancelled()) {
                    println("!!! Cancelled by user !!!");
                    break;
                }
            }
            if (monitor.isCancelled()) break;
        }

        decompiler.dispose();

        // Summary
        println("");
        println("========================================");
        println("=== BatchExportToC Complete ===");
        println("========================================");
        println("Exported:            " + exported);
        println("Skipped (already):   " + skippedAlready);
        println("Skipped (no addr):   " + skippedNoAddr);
        println("Skipped (no func):   " + skippedNoFunc);
        println("Decomp failed:       " + decompFailed);
        println("Output dir:          " + stubsDir.getAbsolutePath());
        println("========================================");
    }

    /** Recursively scan a directory for .c files and add basenames (minus .c) to the set */
    private void scanForCFiles(File dir, Set<String> names) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                scanForCFiles(f, names);
            } else if (f.getName().endsWith(".c")) {
                names.add(f.getName().replace(".c", ""));
            }
        }
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }
}
