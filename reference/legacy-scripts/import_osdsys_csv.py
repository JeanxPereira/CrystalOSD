# Ghidra Jython Script to import OSDSYS CSV
# @category OSDSYS

import csv
import string
from ghidra.program.model.symbol import SourceType
from ghidra.app.cmd.function import CreateFunctionCmd
from ghidra.program.model.address import AddressSet
from ghidra.app.util.importer import MessageLog

def run():
    f = askFile("Select osdsys.csv", "Load")
    if not f:
        print("Canceled.")
        return

    program = currentProgram
    symbolTable = program.getSymbolTable()
    addressFactory = program.getAddressFactory()
    listing = program.getListing()
    namespace = program.getGlobalNamespace()

    count = 0
    with open(f.getAbsolutePath(), 'r') as csvfile:
        reader = csv.reader(csvfile)
        header = next(reader) # skip Name,Start,End,Size
        
        monitor.initialize(sum(1 for row in csvfile) - 1)
        csvfile.seek(0)
        next(reader)
        
        for row in reader:
            if len(row) < 4:
                continue
            name = row[0].strip()
            start_addr_str = row[1].strip()
            end_addr_str = row[2].strip()
            
            try:
                start_val = int(start_addr_str, 16)
                end_val = int(end_addr_str, 16)
            except ValueError:
                continue
                
            start_addr = addressFactory.getAddress(hex(start_val))
            end_addr = addressFactory.getAddress(hex(end_val - 1)) # Inclusive end
            
            # Force executable permission on the memory block
            mem_block = program.getMemory().getBlock(start_addr)
            if mem_block and not mem_block.isExecute():
                mem_block.setExecute(True)
            
            # Create Label
            createLabel(start_addr, name, True)
            
            # Force disassemble if not done
            disassemble(start_addr)

            
            # Create Function spanning the block
            func = listing.getFunctionAt(start_addr)
            if not func:
                cmd = CreateFunctionCmd(name, start_addr, AddressSet(start_addr, end_addr), SourceType.IMPORTED)
                if cmd.applyTo(program):
                    count += 1
            else:
                func.setName(name, SourceType.IMPORTED)
                count += 1
            
            monitor.incrementProgress(1)
            
    print("Successfully imported {} symbols from {}!".format(count, f.getName()))

run()
