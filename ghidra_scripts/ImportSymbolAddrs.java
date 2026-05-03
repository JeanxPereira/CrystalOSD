// Import symbols from symbol_addrs.txt (splat format) into Ghidra
// Format: name = 0xADDRESS; // size:0xXX type:func
// @category OSDSYS
// @author CrystalOSD

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.mem.*;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.regex.*;
import ghidra.app.cmd.function.CreateFunctionCmd;

public class ImportSymbolAddrs extends GhidraScript {

    // Matches: name = 0xADDRESS; // optional comments
    private static final Pattern LINE_PATTERN = Pattern.compile(
        "^\\s*([\\w.]+)\\s*=\\s*0x([0-9a-fA-F]+)\\s*;(.*)$"
    );
    private static final Pattern SIZE_PATTERN = Pattern.compile("size:0x([0-9a-fA-F]+)");
    private static final Pattern TYPE_PATTERN = Pattern.compile("type:(\\w+)");

    @Override
    protected void run() throws Exception {
        File symFile = askFile("Select symbol_addrs.txt", "Open");
        if (symFile == null) return;

        Program program = currentProgram;
        Listing listing = program.getListing();
        SymbolTable symbolTable = program.getSymbolTable();
        AddressFactory addressFactory = program.getAddressFactory();
        Memory memory = program.getMemory();

        BufferedReader reader = new BufferedReader(new FileReader(symFile));
        String line;
        int funcCount = 0, dataCount = 0, skipCount = 0, errorCount = 0;

        while ((line = reader.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) continue;

            Matcher m = LINE_PATTERN.matcher(line);
            if (!m.matches()) continue;

            String name = m.group(1);
            long addrVal = Long.parseLong(m.group(2), 16);
            String comment = m.group(3);
            Address addr = addressFactory.getAddress(Long.toHexString(addrVal));
            if (addr == null) { errorCount++; continue; }

            boolean isFunc = false;
            long size = 0;
            if (comment != null) {
                Matcher tm = TYPE_PATTERN.matcher(comment);
                if (tm.find()) isFunc = tm.group(1).equals("func");
                Matcher sm = SIZE_PATTERN.matcher(comment);
                if (sm.find()) size = Long.parseLong(sm.group(1), 16);
            }

            if (isFunc && memory.contains(addr)) {
                Function func = listing.getFunctionAt(addr);
                if (func == null) {
                    try { disassemble(addr); } catch (Exception e) {}
                    AddressSet body = size > 0 ? new AddressSet(addr, addr.add(size - 1)) : null;
                    CreateFunctionCmd cmd = new CreateFunctionCmd(name, addr, body, SourceType.IMPORTED);
                    if (cmd.applyTo(program)) funcCount++;
                    else { try { symbolTable.createLabel(addr, name, SourceType.IMPORTED); dataCount++; } catch (Exception e) { errorCount++; } }
                } else {
                    try { func.setName(name, SourceType.IMPORTED); funcCount++; }
                    catch (Exception e) { try { func.setName(name + "_dupe", SourceType.IMPORTED); funcCount++; } catch (Exception e2) { errorCount++; } }
                }
            } else {
                try { symbolTable.createLabel(addr, name, SourceType.IMPORTED); dataCount++; }
                catch (Exception e) { skipCount++; }
            }
        }
        reader.close();

        println("=== ImportSymbolAddrs Complete ===");
        println("Functions: " + funcCount + " | Labels: " + dataCount + " | Skipped: " + skipCount + " | Errors: " + errorCount);
    }
}
