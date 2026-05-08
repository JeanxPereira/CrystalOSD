extern char *slash_system_pathname_ptr;

/* 0x0020E3D8 - get_system_folder_name */
char *get_system_folder_name(void) {
    return slash_system_pathname_ptr;
}
