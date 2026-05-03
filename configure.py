#! /usr/bin/env python3

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set, Union

import splat
import splat.scripts.split as split
from   splat.segtypes.linker_entry import LinkerEntry

BASE_PATH = os.path.dirname(__file__)
YAML_FILE = "splat_config.yml"
EXECUTABLE_URL = "https://archive.org/download/hddosd-sudc4-decrypted/OSDSYS_A_unpacked_110u.XLF"
EXECUTABLE_NAME = "OSDSYS_A_XLF_decrypted_unpacked.elf"

def clean():
    if os.path.exists(".splache"):
        os.remove(".splache")
    shutil.rmtree("asm", ignore_errors=True)
    shutil.rmtree("assets", ignore_errors=True)
    shutil.rmtree("build", ignore_errors=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Configure the project")
    parser.add_argument(
        "-v",
        "--verbose",
        help="Enable verbose mode",
        action="store_true",
    )
    parser.add_argument(
        "-c",
        "--clean",
        help="Clean extraction and build artifacts",
        action="store_true",
    )
    parser.add_argument(
        "-csrc",
        "--cleansrc",
        help="Clean the 'src' folder",
        action="store_true",
    )
    args = parser.parse_args()

    if args.clean:
        clean()
    
    if args.cleansrc:
        shutil.rmtree("src", ignore_errors=True)

    if not os.path.isfile(BASE_PATH + "/" + EXECUTABLE_NAME):
        subprocess.run(['curl', '-L', '-o', BASE_PATH + "/" + EXECUTABLE_NAME, EXECUTABLE_URL])

    split.main([Path(BASE_PATH) / YAML_FILE], modes="all", verbose=True if args.verbose else False)

    linker_entries = split.linker_writer.entries
