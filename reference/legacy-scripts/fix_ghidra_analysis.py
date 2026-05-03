# Ghidra Jython Script to force disassembly on bugged ELF tables
# @category OSDSYS

from ghidra.app.cmd.function import CreateFunctionCmd
from ghidra.program.model.symbol import SourceType
from ghidra.app.util.importer import MessageLog

def run():
    program = currentProgram
    symbolTable = program.getSymbolTable()
    listing = program.getListing()

    # 1. Force Execute permission on the main memory block
    mem = program.getMemory()
    blocks = mem.getBlocks()
    for b in blocks:
        # Se for o bloco onde o código mora (como o RAM normal ou .strtab bugado)
        if b.getStart().getOffset() >= 0x00200000:
            b.setExecute(True)

    # 2. Iterate all symbols and force disassembly
    count = 0
    symbols = symbolTable.getSymbolIterator()
    for sym in symbols:
        addr = sym.getAddress()
        name = sym.getName()
        
        # Ignora símbolos padrão que não são funções
        if "elfSection" in name or name.startswith("_") and name != "_exit" and name != "_start":
            continue
            
        disassemble(addr)
        
        func = listing.getFunctionAt(addr)
        if not func:
            cmd = CreateFunctionCmd(name, addr, None, SourceType.IMPORTED)
            if cmd.applyTo(program):
                count += 1
        
    print("Sucesso! Forcamos a compilacao e montamos {} funcoes!".format(count))

run()
