// CrystalOSD main function reconstruction
// 0x0020d4d0 - main

#define NULL ((void*)0)

typedef struct {
    int count;
    int max_count;
    int init_count;
    int wait_threads;
    u32 attr;
    u32 option;
} ee_sema_t;

typedef struct {
    int status;
    void (*func)(void *);
    void *stack;
    int stack_size;
    void *gp_reg;
    int initial_priority;
    int current_priority;
    u32 attr;
    u32 option;
} ee_thread_t;

// Prototypes
extern void do_call_ctors(void);
extern int sceSifInitRpc(int);
extern int sceSifRebootIopWithRawImage(void*, int);
extern int sceSifSyncIop(void);
extern void sceFsReset(void);
extern void sceSifLoadFileReset(void);
extern void sceSifInitIopHeap(void);
extern int do_load_module(void*, void*, int, char*);
extern int check_device_name(char*, void*);
extern int sceOpen(char*, int);
extern int sceClose(int);
extern int sceSifLoadModule(char*, int, int);
extern void do_exec_stockosd_blob(void);
extern void sceMcInit(void);
extern void prepare_system_folder_name(void);
extern int sceMount(char*, char*, int, void*, int);
extern int sceUmount(char*);
extern void fileops_prepare(int);
extern void config_set_default_main(void);
extern int config_first(void);
extern void enable_enter_clock_module_208398(void);
extern void config_set_langtbl(int);
extern void set_osd_config_to_eekernel(void);
extern char* config_get_timezone_city(void);
extern int config_get_timezone_offset(void);
extern void timezone_related_20C0B8(int, int);
extern void fileops_cleanup(void);
extern int config_get_rc_gameplay(void);
extern int sceCdRcBypassCtl(int, void*, void*);
extern int CreateSema(ee_sema_t*);
extern int GetThreadId(void);
extern int CreateThread(ee_thread_t*);
extern int StartThread(int, void*);
extern void sound_thread_prepare(int, void*, void*);
extern void cdvd_handler_prepare(int);
extern void callback_queue_prepare(int);
extern void func_00200F88(void);
extern void InitDraw(void);
extern void graph_reset_related1(void);
extern void graph_reset_related3(void);
extern void DIntr(void);
extern void EIntr(void);
extern int DisableIntc(int);
extern int EnableIntc(int);
extern int ChangeThreadPriority(int, int);
extern int config_get_spdif_mode(void);
extern void sema_related_2118A8(int);
extern int get_lang_string_GetOSDString_hkdosd_p2_tgt(int);
extern int override_illegal_disc_type(void);
extern int enter_clock_module_208378(void);
extern int is_pal_vmode_p9_tgt(void);
extern int WaitSema(int);
extern int Game_Boot_ExecuteDisc_p5_tgt(int, char**);
extern void FlushCache(int);
extern int get_boot_path(int, int, void*);
extern void WakeupThread(int);
extern int strstr(const char *, const char *);
extern int sceCdBootCertify(void*, int, void*);
extern int sceCddaStream(int, int, int, int);
extern int do_get_mechacon_version(void*);
extern void config_set_204DF0(int);
extern void config_set_dvdp_remote_control(int);
extern void InitHddOsdPatch(void);
extern void check_or_clear_history(void);
extern void handle_version_info(void);
extern void init_modules_20D228(void);
extern int scePrintf(const char*, ...);
extern void do_load_hosdsys_110(int, char**);
extern int do_load_resources(char*);
extern void sceMtapInit(void);
extern void sceMtapPortOpen(int);
extern void Rm2Init(int);
extern void scePadInit(int);
extern void sound_init(void);
extern int sceRead(int, void*, int);
extern int sceCdInit(int);

// IRX blobs
extern u8 osdrp_img_bytes[];
extern u8 osdrp_img_bytes_end[];
extern u8 usbd_irx_bytes[];
extern u8 usbd_irx_bytes_end[];
extern u8 usbkbd_irx_bytes[];
extern usbkbd_irx_bytes_end[];
extern u8 subfile_irx_bytes[];
extern u8 subfile_irx_bytes_end[];
extern u8 dev9_irx_bytes[];
extern u8 dev9_irx_bytes_end[];
extern u8 atad_irx_bytes[];
extern u8 atad_irx_bytes_end[];
extern u8 hdd_irx_bytes[];
extern u8 hdd_irx_bytes_end[];
extern u8 pfs_irx_bytes[];
extern u8 pfs_irx_bytes_end[];
extern u8 rmman2_irx_bytes[];
extern u8 rmman2_irx_bytes_end[];

// Strings and labels
extern char aO[];
extern char aM[];
extern char aRom[];
extern char aRom0Adddrv[];
extern char aPfs0_0[];
extern char aHdd0System_0[];
extern char aSkipsearchlate[];
extern char aInitialize[];
extern char aPfs1_1[];
extern char aHdd0Sysconf[];
extern char aScemountPfs1Fa[];
extern char aCCCC[];
extern char aBooterror[];
extern char aDvdplayerElf_1[];
extern char aDvdelf[];
extern char aBoot_0[];
extern char aSkip[];
extern char aBootclock[];
extern char aBootbrowser[];
extern char aBootopening[];
extern char aBootwarning[];
extern char aBootillegal[];
extern char aRom0Romver_1[];
extern char aHdd0_0[];
extern char aSystem[];
extern char aPfs_0[];

// Variables
extern int oobe_forced;
extern int threadid_2AE5D8[];
extern void* graph_swap_frame_thread_proc;
extern void* graph_swap_frame_thread_stack;
extern void* pad_sound_handler_thread_proc;
extern void* pad_sound_handler_thread_stack;
extern void* vblankHandler;
extern void* D_00348838;
extern void* D_00386C60[];
extern void* jpt_20E180[];

// Named absolute addresses
#define execute_app_type (*(int*)0x001f0010)
#define var_current_module (*(int*)0x001f0648)

int main(int argc, char **argv) {
    char stack_buffer[0x400]; // Placeholder
    int s2;
    int s1;
    int s0;
    char *arg0;
    
    do_call_ctors();
    sceSifInitRpc(0);
    
    if (argc == 0) {
        sceSifRebootIopWithRawImage(osdrp_img_bytes, osdrp_img_bytes_end - osdrp_img_bytes);
        while (sceSifSyncIop() != 1);
        
        sceSifInitRpc(0);
        sceFsReset();
        sceSifLoadFileReset();
        sceSifInitIopHeap();
        
        do_load_module(usbd_irx_bytes, usbd_irx_bytes_end, 0, NULL);
        do_load_module(usbkbd_irx_bytes, usbkbd_irx_bytes_end, 0, NULL);
        do_load_module(subfile_irx_bytes, subfile_irx_bytes_end, 0, NULL);
        do_load_module(dev9_irx_bytes, dev9_irx_bytes_end, 0, NULL);
        do_load_module(atad_irx_bytes, atad_irx_bytes_end, 0, NULL);
        do_load_module(hdd_irx_bytes, hdd_irx_bytes_end, 0, aO);
        do_load_module(pfs_irx_bytes, pfs_irx_bytes_end, 12, aM);
        do_load_module(rmman2_irx_bytes, rmman2_irx_bytes_end, 18, NULL);
        
        if (check_device_name(aRom, D_00348838) == 0) {
            s0 = sceOpen(aRom0Adddrv, 1);
            if (s0 >= 0) {
                sceClose(s0);
                sceSifLoadModule(aRom0Adddrv, 0, 0);
            }
        }
        do_exec_stockosd_blob();
    } else {
        arg0 = argv[0];
        sceSifRebootIopWithRawImage(osdrp_img_bytes, osdrp_img_bytes_end - osdrp_img_bytes);
        
        while (sceSifSyncIop() != 1);
        
        sceSifInitRpc(0);
        sceFsReset();
        sceSifLoadFileReset();
        sceSifInitIopHeap();
        
        do_load_module(usbd_irx_bytes, usbd_irx_bytes_end, 0, NULL);
        do_load_module(usbkbd_irx_bytes, usbkbd_irx_bytes_end, 0, NULL);
        do_load_module(subfile_irx_bytes, subfile_irx_bytes_end, 0, NULL);
        do_load_module(dev9_irx_bytes, dev9_irx_bytes_end, 0, NULL);
        do_load_module(atad_irx_bytes, atad_irx_bytes_end, 0, NULL);
        do_load_module(hdd_irx_bytes, hdd_irx_bytes_end, 0, aO);
        do_load_module(pfs_irx_bytes, pfs_irx_bytes_end, 12, aM);
        do_load_module(rmman2_irx_bytes, rmman2_irx_bytes_end, 18, NULL);
        
        if (check_device_name(aRom, arg0) == 0) {
            s0 = sceOpen(aRom0Adddrv, 1);
            if (s0 >= 0) {
                sceClose(s0);
                sceSifLoadModule(aRom0Adddrv, 0, 0);
            }
        }
    }
    
    sceMcInit();
    prepare_system_folder_name();
    sceMount(aPfs0_0, aHdd0System_0, 1, NULL, 0);
    
    s2 = 0;
    if (argc > 1) {
        for (s1 = 1; s1 < argc; s1++) {
            if (strcmp(argv[s1], aSkipsearchlate) == 0) {
                s2 = 1;
            } else if (strcmp(argv[s1], aInitialize) == 0) {
                oobe_forced = 1;
            }
        }
    }
    
    if (s2 == 0) {
        do_load_hosdsys_110(argc, argv);
    }
    
    sceCdInit(1);
    do_load_resources(argv[0]);
    sceMtapInit();
    sceMtapPortOpen(0);
    sceMtapPortOpen(1);
    sceMtapPortOpen(2);
    sceMtapPortOpen(3);
    Rm2Init(0);
    scePadInit(0);
    sound_init();
    
    return 0;
}
