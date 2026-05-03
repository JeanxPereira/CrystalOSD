.set noat
.set noreorder

graph_reset_related3:
    addiu      $sp, $sp, -0x20
    sd         $s0, 0x0($sp)
    sd         $ra, 0x10($sp)
    jal        config_get_video_output
    lui       $s0, %hi(D_002AD980)
    lw         $v1, %lo(D_002AD980)($s0)
    beq        $v1, $v0, .L0020BEF0
    ld        $ra, 0x10($sp)
    jal        config_get_video_output
    nop
    daddu      $v1, $v0, $zero
    beqz       $v1, .L0020BE80
    sw        $v1, %lo(D_002AD980)($s0)
    addiu      $v0, $zero, 0x1
    beq        $v1, $v0, .L0020BEB8
    ld        $ra, 0x10($sp)
    b          .L0020BEF4
    ld        $s0, 0x0($sp)
.L0020BE80:
    jal        SetGsVParam
    daddu     $a0, $zero, $zero
    jal        is_pal_vmode_p9_tgt
    nop
    addiu      $v1, $zero, 0x2
    addiu      $a2, $zero, 0x3
    ld         $ra, 0x10($sp)
    movz       $a2, $v1, $v0
    ld         $s0, 0x0($sp)
    addiu      $a0, $zero, 0x2
    addiu      $a1, $zero, 0x1
    addiu      $a3, $zero, 0x1
    j          sceGsResetGraph
    addiu     $sp, $sp, 0x20
.L0020BEB8:
    jal        SetGsVParam
    addiu     $a0, $zero, 0x1
    jal        is_pal_vmode_p9_tgt
    nop
    addiu      $v1, $zero, 0x2
    addiu      $a2, $zero, 0x3
    ld         $ra, 0x10($sp)
    movz       $a2, $v1, $v0
    ld         $s0, 0x0($sp)
    addiu      $a0, $zero, 0x2
    addiu      $a1, $zero, 0x1
    addiu      $a3, $zero, 0x1
    j          sceGsResetGraph
    addiu     $sp, $sp, 0x20
.L0020BEF0:
    ld         $s0, 0x0($sp)
.L0020BEF4:
    jr         $ra
    addiu     $sp, $sp, 0x20
