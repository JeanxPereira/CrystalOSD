# US 6,693,606 B1 — Patent Figures (SVG)

---

## FIG. 1 — Linear Block Group Display

<svg viewBox="0 0 600 210" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="11">
  <defs>
    <pattern id="diag1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#555" stroke-width="1.5"/>
    </pattern>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="black"/>
    </marker>
  </defs>

  <!-- Frame -->
  <rect x="8" y="22" width="584" height="148" fill="white" stroke="black" stroke-width="1.5"/>

  <!-- 12 blocks: w=40, h=118, gap=7, start x=17 → x[i]=17+i*47 -->
  <rect x="17"  y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="64"  y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="111" y="30" width="40" height="118" fill="white" stroke="black"/>
  <!-- 4th block = 102a, hatched -->
  <rect x="158" y="30" width="40" height="118" fill="url(#diag1)" stroke="black"/>
  <rect x="205" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="252" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="299" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="346" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="393" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="440" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="487" y="30" width="40" height="118" fill="white" stroke="black"/>
  <rect x="534" y="30" width="40" height="118" fill="white" stroke="black"/>

  <!-- Label 102 (first block) -->
  <line x1="37" y1="20" x2="37" y2="29" stroke="black" marker-end="url(#arr)"/>
  <text x="37" y="16" text-anchor="middle">102</text>

  <!-- Label 102a (4th block) -->
  <line x1="178" y1="16" x2="178" y2="29" stroke="black" marker-end="url(#arr)"/>
  <text x="178" y="12" text-anchor="middle">102a</text>

  <!-- Label 102 (last block) -->
  <line x1="554" y1="20" x2="554" y2="29" stroke="black" marker-end="url(#arr)"/>
  <text x="554" y="16" text-anchor="middle">102</text>

  <!-- Brace for group 100 -->
  <path d="M 17,152 L 17,163 Q 17,168 22,168 L 292,168 Q 297,168 297,173 L 297,176
           L 297,173 Q 297,168 302,168 L 572,168 Q 577,168 577,163 L 577,152"
        fill="none" stroke="black" stroke-width="1.5"/>
  <text x="297" y="193" text-anchor="middle">100</text>
</svg>

---

## FIG. 2 — Dual-Ring Circular Block Display

<svg viewBox="0 0 640 660" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="11">
  <defs>
    <pattern id="diag2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#555" stroke-width="1.5"/>
    </pattern>
    <marker id="arr2" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="black"/>
    </marker>
  </defs>

  <!-- Downward arrow at top (12 o'clock indicator) -->
  <line x1="320" y1="10" x2="320" y2="58" stroke="black" stroke-width="1.5" marker-end="url(#arr2)"/>

  <!-- INNER ring: 12 blocks, w=10, inner r=72, outer r=132 -->
  <!-- rect x=-5, y=-132, w=10, h=60 ; transform=translate(320,320) rotate(α) -->
  <g transform="translate(320,320) rotate(0)">  <rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(30)"> <rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(60)"> <rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <!-- 114a: colored inner block at α=90° (3 o'clock) -->
  <g transform="translate(320,320) rotate(90)"> <rect x="-5" y="-132" width="10" height="60" fill="url(#diag2)" stroke="black"/></g>
  <g transform="translate(320,320) rotate(120)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(150)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(180)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(210)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(240)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(270)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(300)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(330)"><rect x="-5" y="-132" width="10" height="60" fill="white" stroke="black"/></g>

  <!-- OUTER ring: 12 blocks, w=18, inner r=152, outer r=250 -->
  <!-- rect x=-9, y=-250, w=18, h=98 ; transform=translate(320,320) rotate(α) -->
  <g transform="translate(320,320) rotate(0)">  <rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <!-- 116a: colored outer block at α=30° -->
  <g transform="translate(320,320) rotate(30)"> <rect x="-9" y="-250" width="18" height="98" fill="url(#diag2)" stroke="black"/></g>
  <g transform="translate(320,320) rotate(60)"> <rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(90)"> <rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(120)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(150)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(180)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(210)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(240)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(270)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(300)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>
  <g transform="translate(320,320) rotate(330)"><rect x="-9" y="-250" width="18" height="98" fill="white" stroke="black"/></g>

  <!-- Label: 110 (inner group, lower-left) -->
  <!-- inner block at α=225°: sin=-0.707,cos=-0.707 → x=320-72.1=248,y=320+72.1=392 -->
  <line x1="220" y1="430" x2="252" y2="400" stroke="black" marker-end="url(#arr2)"/>
  <text x="200" y="445" text-anchor="middle">110</text>

  <!-- Label: 114 (inner block, lower-right) -->
  <!-- inner block at α=135°: x=320+72=392, y=320+72=392 -->
  <line x1="415" y1="430" x2="395" y2="400" stroke="black" marker-end="url(#arr2)"/>
  <text x="430" y="445" text-anchor="middle">114</text>

  <!-- Label: 114a (colored inner block, α=90°, right) -->
  <!-- block center at x=320+102=422, y=320 -->
  <line x1="460" y1="320" x2="428" y2="320" stroke="black" marker-end="url(#arr2)"/>
  <text x="480" y="324" text-anchor="start">114a</text>

  <!-- Label: 112 (outer group, right) -->
  <!-- outer block at α=90°: x=320+201=521, y=320 -->
  <line x1="565" y1="340" x2="523" y2="322" stroke="black" marker-end="url(#arr2)"/>
  <text x="580" y="355" text-anchor="middle">112</text>

  <!-- Label: 116 (outer block, lower-right, α=120°) -->
  <!-- sin(120°)=0.866,cos(120°)=-0.5 → x=320+174=494,y=320+100=420 -->
  <line x1="560" y1="450" x2="498" y2="425" stroke="black" marker-end="url(#arr2)"/>
  <text x="580" y="464" text-anchor="middle">116</text>

  <!-- Label: 116a (colored outer block, α=30°) -->
  <!-- sin(30°)=0.5,cos(30°)=0.866 → x=320+100.5=420,y=320-174=146 -->
  <line x1="475" y1="110" x2="428" y2="148" stroke="black" marker-end="url(#arr2)"/>
  <text x="495" y="104" text-anchor="middle">116a</text>
</svg>

---

## FIG. 3 — 3D Perspective of Rotated Block Groups

<svg viewBox="0 0 580 580" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="11">
  <defs>
    <pattern id="diag3" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#555" stroke-width="1.2"/>
    </pattern>
    <marker id="arr3" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="black"/>
    </marker>
  </defs>

  <!-- 3D perspective view: blocks rendered as parallelograms/prisms -->
  <!-- Offset for 3D: dx=8, dy=-5 (top face) -->

  <!-- Helper macro: 3D block at polar coords. We draw front face + top face + right face -->
  <!-- Inner ring: 12 narrow prisms, outer ring: 12 wider prisms, viewed from slight elevation -->
  <!-- Center of scene: (290, 290) -->

  <!-- INNER RING blocks as 3D prisms (simplified isometric) -->
  <!-- Each block: front face + top shaded face, rotated radially -->
  <!-- Block dimensions: w=10, h=55 (depth), thickness=8 -->
  <!-- 3D offset: (6, -4) -->

  <g transform="translate(290,290)">
    <!-- Inner blocks at 12 angles, rendered as 3D prisms -->
    <!-- Angle 0° (top) -->
    <g transform="rotate(0)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 30° -->
    <g transform="rotate(30)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 60° -->
    <g transform="rotate(60)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 90° = 114a (colored/hatched) -->
    <g transform="rotate(90)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="url(#diag3)" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#aaa" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#888" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 120° -->
    <g transform="rotate(120)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 150° -->
    <g transform="rotate(150)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 180° -->
    <g transform="rotate(180)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 210° -->
    <g transform="rotate(210)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 240° -->
    <g transform="rotate(240)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 270° -->
    <g transform="rotate(270)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 300° -->
    <g transform="rotate(300)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 330° -->
    <g transform="rotate(330)">
      <polygon points="-5,-132, 5,-132, 5,-72, -5,-72" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-5,-132, 1,-136, 11,-136, 5,-132" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="5,-132, 11,-136, 11,-76, 5,-72" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>

    <!-- OUTER RING blocks as 3D prisms -->
    <!-- Angle 0° -->
    <g transform="rotate(0)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 30° = 116a (colored) -->
    <g transform="rotate(30)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="url(#diag3)" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#aaa" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#888" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 60° -->
    <g transform="rotate(60)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 90° -->
    <g transform="rotate(90)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 120° -->
    <g transform="rotate(120)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 150° -->
    <g transform="rotate(150)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 180° -->
    <g transform="rotate(180)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 210° -->
    <g transform="rotate(210)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 240° -->
    <g transform="rotate(240)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 270° -->
    <g transform="rotate(270)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 300° -->
    <g transform="rotate(300)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Angle 330° -->
    <g transform="rotate(330)">
      <polygon points="-9,-250, 9,-250, 9,-152, -9,-152" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-9,-250, -3,-255, 15,-255, 9,-250" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="9,-250, 15,-255, 15,-157, 9,-152" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
  </g>

  <!-- Labels -->
  <marker id="arr3b" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="black"/>
  </marker>
  <!-- 110 label → inner block at α=225° (lower-left): x=290-72*0.707=239, y=290+72*0.707=341 -->
  <line x1="175" y1="410" x2="243" y2="348" stroke="black" marker-end="url(#arr3b)"/>
  <text x="165" y="424" text-anchor="middle">110</text>

  <!-- 114 label → inner block at α=150°: x=290+72*0.5=326, y=290+72*0.866=352 -->
  <line x1="370" y1="420" x2="332" y2="357" stroke="black" marker-end="url(#arr3b)"/>
  <text x="385" y="434" text-anchor="middle">114</text>

  <!-- 114a label → colored inner at α=90°: x=290+102=392, y=290 -->
  <line x1="430" y1="290" x2="396" y2="290" stroke="black" marker-end="url(#arr3b)"/>
  <text x="450" y="294" text-anchor="start">114a</text>

  <!-- 112 label → outer block at α=90°: x=290+201=491, y=290 -->
  <line x1="510" y1="310" x2="494" y2="293" stroke="black" marker-end="url(#arr3b)"/>
  <text x="520" y="324" text-anchor="start">112</text>

  <!-- 116 label → outer at α=120°: x=290+174=464, y=290+100=390 -->
  <line x1="490" y1="430" x2="467" y2="396" stroke="black" marker-end="url(#arr3b)"/>
  <text x="505" y="444" text-anchor="start">116</text>

  <!-- 116a label → colored outer at α=30°: x=290+100=390, y=290-174=116 -->
  <line x1="430" y1="90" x2="396" y2="120" stroke="black" marker-end="url(#arr3b)"/>
  <text x="445" y="84" text-anchor="start">116a</text>
</svg>

---

## FIG. 4 — Entertainment Apparatus Block Diagram

<svg viewBox="0 0 680 520" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="10">
  <defs>
    <marker id="a4" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- IMAGE PROCESSOR 20 bounding box -->
  <rect x="370" y="30" width="290" height="240" fill="#f8f8f8" stroke="black" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="515" y="24" text-anchor="middle" font-size="10" font-weight="bold">20</text>

  <!-- DISPLAY MONITOR 18 -->
  <rect x="490" y="10" width="130" height="30" fill="white" stroke="black"/>
  <text x="555" y="20" text-anchor="middle" font-size="9">DISPLAY</text>
  <text x="555" y="30" text-anchor="middle" font-size="9">MONITOR</text>
  <text x="640" y="22" text-anchor="start" font-size="10">18</text>

  <!-- DISPLAY CONTROLLER 76 -->
  <rect x="490" y="55" width="130" height="35" fill="white" stroke="black"/>
  <text x="555" y="68" text-anchor="middle" font-size="9">DISPLAY</text>
  <text x="555" y="80" text-anchor="middle" font-size="9">CONTROLLER</text>
  <text x="555" y="48" text-anchor="middle" font-size="9">76</text>

  <!-- MEMORY INTERFACE 72 -->
  <rect x="430" y="130" width="120" height="35" fill="white" stroke="black"/>
  <text x="490" y="148" text-anchor="middle" font-size="9">MEMORY</text>
  <text x="490" y="160" text-anchor="middle" font-size="9">INTERFACE</text>
  <text x="490" y="124" text-anchor="middle" font-size="9">72</text>

  <!-- IMAGE MEMORY 74 -->
  <rect x="560" y="130" width="90" height="35" fill="white" stroke="black"/>
  <text x="605" y="148" text-anchor="middle" font-size="9">IMAGE</text>
  <text x="605" y="160" text-anchor="middle" font-size="9">MEMORY</text>
  <text x="605" y="124" text-anchor="middle" font-size="9">74</text>

  <!-- RENDERING ENGINE 70 -->
  <rect x="375" y="130" width="50" height="80" fill="white" stroke="black"/>
  <text x="400" y="158" text-anchor="middle" font-size="9">RENDER</text>
  <text x="400" y="170" text-anchor="middle" font-size="9">ING</text>
  <text x="400" y="182" text-anchor="middle" font-size="9">ENGINE</text>
  <text x="400" y="124" text-anchor="middle" font-size="9">70</text>

  <!-- Bus 78 (Rendering ↔ MemIF) -->
  <line x1="425" y1="160" x2="430" y2="160" stroke="black" stroke-width="2"/>
  <text x="427" y="156" font-size="8">78</text>

  <!-- Bus 80 (MemIF ↔ ImageMem) -->
  <line x1="550" y1="147" x2="560" y2="147" stroke="black" stroke-width="2"/>
  <text x="552" y="144" font-size="8">80</text>

  <!-- Connections inside image processor -->
  <line x1="555" y1="90" x2="555" y2="130" stroke="black" marker-end="url(#a4)"/>
  <line x1="555" y1="130" x2="555" y2="90" stroke="black" marker-end="url(#a4)"/>
  <line x1="490" y1="90" x2="490" y2="130" stroke="black" stroke-width="1.5"/>
  <line x1="428" y1="165" x2="430" y2="165" stroke="black" stroke-width="2"/>

  <!-- Display controller → Display Monitor -->
  <line x1="555" y1="55" x2="555" y2="40" stroke="black" marker-end="url(#a4)"/>

  <!-- GIF 22 -->
  <rect x="290" y="200" width="65" height="40" fill="white" stroke="black"/>
  <text x="322" y="218" text-anchor="middle" font-size="10" font-weight="bold">GIF</text>
  <text x="340" y="208" font-size="10">22</text>

  <!-- RTC 28 -->
  <rect x="370" y="200" width="50" height="40" fill="white" stroke="black"/>
  <text x="395" y="218" text-anchor="middle" font-size="9">RTC</text>
  <text x="395" y="230" text-anchor="middle" font-size="9">28</text>

  <!-- GIF ↔ RTC -->
  <line x1="355" y1="220" x2="370" y2="220" stroke="black" stroke-width="1.5"/>
  <line x1="370" y1="220" x2="355" y2="220" stroke="black" stroke-width="1.5"/>

  <!-- GIF → Image Processor (Rendering Engine) -->
  <line x1="322" y1="200" x2="375" y2="170" stroke="black" marker-end="url(#a4)"/>
  <line x1="375" y1="170" x2="322" y2="200" stroke="black" marker-end="url(#a4)"/>

  <!-- VECTOR OPERATION UNIT 16 -->
  <rect x="150" y="200" width="130" height="40" fill="white" stroke="black"/>
  <text x="215" y="218" text-anchor="middle" font-size="9">VECTOR</text>
  <text x="215" y="230" text-anchor="middle" font-size="9">OPERATION UNIT</text>
  <text x="240" y="197" font-size="10">16</text>

  <!-- VOU ↔ GIF -->
  <line x1="280" y1="220" x2="290" y2="220" stroke="black" stroke-width="2"/>
  <line x1="290" y1="220" x2="280" y2="220" stroke="black" stroke-width="2"/>

  <!-- MPU 12 -->
  <rect x="20" y="200" width="60" height="40" fill="white" stroke="black"/>
  <text x="50" y="218" text-anchor="middle" font-size="10" font-weight="bold">MPU</text>
  <text x="65" y="197" font-size="10">12</text>

  <!-- Bus 30 (horizontal bus bar) -->
  <line x1="50" y1="260" x2="410" y2="260" stroke="black" stroke-width="3"/>
  <text x="420" y="264" font-size="10">30</text>

  <!-- MPU → Bus -->
  <line x1="50" y1="240" x2="50" y2="260" stroke="black" stroke-width="1.5"/>
  <!-- VOU → Bus -->
  <line x1="215" y1="240" x2="215" y2="260" stroke="black" stroke-width="1.5"/>
  <!-- GIF → Bus -->
  <line x1="322" y1="240" x2="322" y2="260" stroke="black" stroke-width="1.5"/>
  <!-- RTC → Bus -->
  <line x1="395" y1="240" x2="395" y2="260" stroke="black" stroke-width="1.5"/>

  <!-- MAIN MEMORY 14 -->
  <rect x="150" y="290" width="120" height="35" fill="white" stroke="black"/>
  <text x="210" y="308" text-anchor="middle" font-size="9">MAIN MEMORY</text>
  <text x="240" y="288" font-size="10">14</text>
  <line x1="210" y1="260" x2="210" y2="290" stroke="black" stroke-width="1.5"/>

  <!-- I/O PORT 24 -->
  <rect x="20" y="290" width="90" height="35" fill="white" stroke="black"/>
  <text x="65" y="308" text-anchor="middle" font-size="9">INPUT/OUTPUT</text>
  <text x="65" y="318" text-anchor="middle" font-size="9">PORT</text>
  <text x="95" y="288" font-size="10">24</text>
  <line x1="65" y1="260" x2="65" y2="290" stroke="black" stroke-width="1.5"/>

  <!-- OSD ROM 26 -->
  <rect x="280" y="290" width="80" height="35" fill="white" stroke="black"/>
  <text x="320" y="308" text-anchor="middle" font-size="9">OSD ROM</text>
  <text x="340" y="288" font-size="10">26</text>
  <line x1="320" y1="260" x2="320" y2="290" stroke="black" stroke-width="1.5"/>

  <!-- INPUT DEVICE 32 -->
  <rect x="20" y="365" width="90" height="35" fill="white" stroke="black"/>
  <text x="65" y="383" text-anchor="middle" font-size="9">INPUT</text>
  <text x="65" y="395" text-anchor="middle" font-size="9">DEVICE</text>
  <text x="95" y="363" font-size="10">32</text>
  <line x1="65" y1="325" x2="65" y2="365" stroke="black" stroke-width="1.5" marker-end="url(#a4)"/>
  <line x1="65" y1="365" x2="65" y2="325" stroke="black" stroke-width="1.5" marker-end="url(#a4)"/>

  <!-- OPTICAL DISK DRIVE 36 -->
  <rect x="150" y="365" width="110" height="35" fill="white" stroke="black"/>
  <text x="205" y="383" text-anchor="middle" font-size="9">OPTICAL DISK</text>
  <text x="205" y="395" text-anchor="middle" font-size="9">DRIVE</text>
  <text x="240" y="363" font-size="10">36</text>
  <line x1="205" y1="325" x2="205" y2="365" stroke="black" stroke-width="1.5" marker-end="url(#a4)"/>

  <!-- OPTICAL DISK 34 (circle) -->
  <ellipse cx="315" cy="382" rx="40" ry="18" fill="white" stroke="black"/>
  <text x="315" y="386" text-anchor="middle" font-size="9">DISK</text>
  <text x="340" y="363" font-size="10">34</text>
  <line x1="275" y1="382" x2="260" y2="382" stroke="black" marker-end="url(#a4)"/>
</svg>

---

## FIG. 5 — Measured Quantity Displaying Means (Functional Block Diagram)

<svg viewBox="0 0 700 500" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a5" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- RTC 28 -->
  <rect x="10" y="40" width="60" height="30" fill="white" stroke="black"/>
  <text x="40" y="58" text-anchor="middle">RTC</text>
  <text x="55" y="38" font-size="9">28</text>

  <!-- CLOCK INFO READING MEANS 202 -->
  <rect x="85" y="30" width="105" height="50" fill="white" stroke="black"/>
  <text x="137" y="50" text-anchor="middle">CLOCK</text>
  <text x="137" y="62" text-anchor="middle">INFORMATION</text>
  <text x="137" y="74" text-anchor="middle">READING MEANS</text>
  <text x="175" y="28" font-size="9">202</text>
  <line x1="70" y1="55" x2="85" y2="55" stroke="black" marker-end="url(#a5)"/>

  <!-- OBJECT DATA FILE 204 -->
  <rect x="10" y="110" width="65" height="40" fill="white" stroke="black" stroke-dasharray="4,2"/>
  <text x="42" y="127" text-anchor="middle">OBJECT</text>
  <text x="42" y="139" text-anchor="middle">DATA FILE</text>
  <text x="60" y="108" font-size="9">204</text>

  <!-- OBJECT DATA READING MEANS 210 -->
  <rect x="85" y="105" width="105" height="50" fill="white" stroke="black"/>
  <text x="137" y="125" text-anchor="middle">OBJECT DATA</text>
  <text x="137" y="137" text-anchor="middle">READING</text>
  <text x="137" y="149" text-anchor="middle">MEANS</text>
  <text x="175" y="103" font-size="9">210</text>
  <line x1="75" y1="130" x2="85" y2="130" stroke="black" marker-end="url(#a5)"/>

  <!-- COLORING BLOCK DETERMINING MEANS 212 -->
  <rect x="215" y="30" width="120" height="50" fill="white" stroke="black"/>
  <text x="275" y="50" text-anchor="middle">COLORING BLOCK</text>
  <text x="275" y="62" text-anchor="middle">DETERMINING</text>
  <text x="275" y="74" text-anchor="middle">MEANS</text>
  <text x="310" y="28" font-size="9">212</text>
  <line x1="190" y1="55" x2="215" y2="55" stroke="black" marker-end="url(#a5)"/>
  <line x1="190" y1="130" x2="215" y2="130" stroke="black" marker-end="url(#a5)"/>

  <!-- AMOUNT-OF-COLORING DETERMINING MEANS 214 -->
  <rect x="215" y="105" width="120" height="50" fill="white" stroke="black"/>
  <text x="275" y="125" text-anchor="middle">AMOUNT-OF-</text>
  <text x="275" y="137" text-anchor="middle">COLORING DET.</text>
  <text x="275" y="149" text-anchor="middle">MEANS</text>
  <text x="310" y="103" font-size="9">214</text>

  <!-- ANGULAR DISPLACEMENT DETERMINING MEANS 216 -->
  <rect x="215" y="180" width="120" height="50" fill="white" stroke="black"/>
  <text x="275" y="200" text-anchor="middle">ANGULAR DISP.</text>
  <text x="275" y="212" text-anchor="middle">DETERMINING</text>
  <text x="275" y="224" text-anchor="middle">MEANS</text>
  <text x="310" y="178" font-size="9">216</text>
  <line x1="190" y1="130" x2="215" y2="205" stroke="black" marker-end="url(#a5)"/>

  <!-- VERTEX DATA REWRITING MEANS 218 -->
  <rect x="360" y="60" width="120" height="50" fill="white" stroke="black"/>
  <text x="420" y="80" text-anchor="middle">VERTEX DATA</text>
  <text x="420" y="92" text-anchor="middle">REWRITING</text>
  <text x="420" y="104" text-anchor="middle">MEANS</text>
  <text x="455" y="58" font-size="9">218</text>
  <line x1="335" y1="55" x2="360" y2="80" stroke="black" marker-end="url(#a5)"/>
  <line x1="335" y1="130" x2="360" y2="90" stroke="black" marker-end="url(#a5)"/>
  <line x1="335" y1="205" x2="360" y2="100" stroke="black" marker-end="url(#a5)"/>

  <!-- OBJECT DATA 206/208 -->
  <rect x="360" y="160" width="120" height="30" fill="white" stroke="black" stroke-dasharray="4,2"/>
  <text x="420" y="180" text-anchor="middle">OBJECT DATA</text>
  <text x="455" y="158" font-size="9">206(208)</text>
  <line x1="420" y1="110" x2="420" y2="160" stroke="black" stroke-width="1" marker-end="url(#a5)"/>
  <line x1="420" y1="160" x2="420" y2="110" stroke="black" stroke-width="1" marker-end="url(#a5)"/>

  <!-- BLOCK GROUP RENDERING MEANS 220 -->
  <rect x="505" y="60" width="120" height="50" fill="white" stroke="black"/>
  <text x="565" y="80" text-anchor="middle">BLOCK GROUP</text>
  <text x="565" y="92" text-anchor="middle">RENDERING</text>
  <text x="565" y="104" text-anchor="middle">MEANS</text>
  <text x="600" y="58" font-size="9">220</text>
  <line x1="480" y1="85" x2="505" y2="85" stroke="black" marker-end="url(#a5)"/>

  <!-- IMAGE MEMORY 74 -->
  <rect x="505" y="155" width="120" height="30" fill="white" stroke="black"/>
  <text x="565" y="175" text-anchor="middle">IMAGE MEMORY</text>
  <text x="600" y="153" font-size="9">74</text>
  <line x1="565" y1="110" x2="565" y2="155" stroke="black" marker-end="url(#a5)"/>

  <!-- IMAGE DATA OUTPUTTING MEANS 222 -->
  <rect x="505" y="220" width="120" height="50" fill="white" stroke="black"/>
  <text x="565" y="240" text-anchor="middle">IMAGE DATA</text>
  <text x="565" y="252" text-anchor="middle">OUTPUTTING</text>
  <text x="565" y="264" text-anchor="middle">MEANS</text>
  <text x="600" y="218" font-size="9">222</text>
  <line x1="565" y1="185" x2="565" y2="220" stroke="black" marker-end="url(#a5)"/>

  <!-- DISPLAY MONITOR 18 -->
  <rect x="505" y="310" width="120" height="35" fill="white" stroke="black"/>
  <text x="565" y="328" text-anchor="middle">DISPLAY</text>
  <text x="565" y="340" text-anchor="middle">MONITOR</text>
  <text x="600" y="308" font-size="9">18</text>
  <line x1="565" y1="270" x2="565" y2="310" stroke="black" marker-end="url(#a5)"/>

  <!-- END DETERMINING MEANS 224 -->
  <rect x="215" y="370" width="120" height="50" fill="white" stroke="black"/>
  <text x="275" y="390" text-anchor="middle">END</text>
  <text x="275" y="402" text-anchor="middle">DETERMINING</text>
  <text x="275" y="414" text-anchor="middle">MEANS</text>
  <text x="310" y="368" font-size="9">224</text>
  <line x1="565" y1="310" x2="275" y2="420" stroke="black" marker-end="url(#a5)"/>

  <!-- 200 label -->
  <text x="350" y="490" text-anchor="middle" font-size="10" font-weight="bold">200</text>
  <rect x="5" y="15" width="685" height="475" fill="none" stroke="black" stroke-width="1.5" stroke-dasharray="8,4"/>
</svg>

---

## FIG. 6 — Processing Flowchart (Part 1, Steps S1–S8)

<svg viewBox="0 0 360 620" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a6" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- START terminal -->
  <rect x="110" y="10" width="120" height="28" rx="14" fill="white" stroke="black"/>
  <text x="170" y="29" text-anchor="middle">START</text>

  <!-- Connector (2) coming in from left -->
  <circle cx="50" cy="75" r="14" fill="white" stroke="black"/>
  <text x="50" y="80" text-anchor="middle" font-weight="bold">2</text>
  <line x1="64" y1="75" x2="170" y2="75" stroke="black"/>

  <!-- Arrow from START to S1 -->
  <line x1="170" y1="38" x2="170" y2="55" stroke="black" marker-end="url(#a6)"/>

  <!-- S1 -->
  <rect x="50" y="55" width="240" height="36" fill="white" stroke="black"/>
  <text x="170" y="70" text-anchor="middle">READ CLOCK INFORMATION</text>
  <text x="300" y="65" font-size="8">S1</text>
  <line x1="170" y1="91" x2="170" y2="108" stroke="black" marker-end="url(#a6)"/>

  <!-- S2 -->
  <rect x="50" y="108" width="240" height="46" fill="white" stroke="black"/>
  <text x="170" y="124" text-anchor="middle">READ OBJECT DATA OF 1ST</text>
  <text x="170" y="136" text-anchor="middle">BLOCK GROUP FROM</text>
  <text x="170" y="148" text-anchor="middle">OBJECT DATA FILE</text>
  <text x="300" y="120" font-size="8">S2</text>
  <line x1="170" y1="154" x2="170" y2="171" stroke="black" marker-end="url(#a6)"/>

  <!-- S3 -->
  <rect x="50" y="171" width="240" height="36" fill="white" stroke="black"/>
  <text x="170" y="186" text-anchor="middle">DETERMINE BLOCK TO BE</text>
  <text x="170" y="198" text-anchor="middle">COLORED BASED ON HOUR DATA</text>
  <text x="300" y="183" font-size="8">S3</text>
  <line x1="170" y1="207" x2="170" y2="224" stroke="black" marker-end="url(#a6)"/>

  <!-- S4 -->
  <rect x="50" y="224" width="240" height="36" fill="white" stroke="black"/>
  <text x="170" y="239" text-anchor="middle">DETERMINE AMOUNT OF</text>
  <text x="170" y="251" text-anchor="middle">COLORING BASED ON MINUTE DATA</text>
  <text x="300" y="236" font-size="8">S4</text>
  <line x1="170" y1="260" x2="170" y2="277" stroke="black" marker-end="url(#a6)"/>

  <!-- S5 -->
  <rect x="50" y="277" width="240" height="46" fill="white" stroke="black"/>
  <text x="170" y="293" text-anchor="middle">REWRITE VERTEX DATA IN RANGE</text>
  <text x="170" y="305" text-anchor="middle">DEPENDING ON AMOUNT OF COLORING,</text>
  <text x="170" y="317" text-anchor="middle">OF VERTEX DATA OF BLOCK TO BE COLORED</text>
  <text x="300" y="289" font-size="8">S5</text>
  <line x1="170" y1="323" x2="170" y2="340" stroke="black" marker-end="url(#a6)"/>

  <!-- S6 -->
  <rect x="50" y="340" width="240" height="46" fill="white" stroke="black"/>
  <text x="170" y="356" text-anchor="middle">DETERMINE ANGULAR DISPLACEMENT</text>
  <text x="170" y="368" text-anchor="middle">ABOUT LONGITUDINAL AXIS OF BLOCK</text>
  <text x="170" y="380" text-anchor="middle">TO BE COLORED BASED ON CLOCK INFO</text>
  <text x="300" y="352" font-size="8">S6</text>
  <line x1="170" y1="386" x2="170" y2="403" stroke="black" marker-end="url(#a6)"/>

  <!-- S7 -->
  <rect x="50" y="403" width="240" height="36" fill="white" stroke="black"/>
  <text x="170" y="418" text-anchor="middle">REWRITE VERTEX DATA OF ALL BLOCKS</text>
  <text x="170" y="430" text-anchor="middle">OF 1ST BLOCK GROUP BASED ON ANG. DISP.</text>
  <text x="300" y="415" font-size="8">S7</text>
  <line x1="170" y1="439" x2="170" y2="456" stroke="black" marker-end="url(#a6)"/>

  <!-- S8 -->
  <rect x="50" y="456" width="240" height="46" fill="white" stroke="black"/>
  <text x="170" y="472" text-anchor="middle">RENDER ALL BLOCKS ACCORDING TO</text>
  <text x="170" y="484" text-anchor="middle">REFRACTING PROCESS, BUMP MAPPING</text>
  <text x="170" y="496" text-anchor="middle">PROCESS, AND STORE IMAGE DATA IN MEM</text>
  <text x="300" y="468" font-size="8">S8</text>
  <line x1="170" y1="502" x2="170" y2="519" stroke="black" marker-end="url(#a6)"/>

  <!-- Connector (1) to FIG.7 -->
  <circle cx="170" cy="533" r="14" fill="white" stroke="black"/>
  <text x="170" y="538" text-anchor="middle" font-weight="bold">1</text>
</svg>

---

## FIG. 7 — Processing Flowchart (Part 2, Steps S9–S17)

<svg viewBox="0 0 400 660" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a7" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- Connector (1) from FIG.6 -->
  <circle cx="180" cy="18" r="14" fill="white" stroke="black"/>
  <text x="180" y="23" text-anchor="middle" font-weight="bold">1</text>
  <line x1="180" y1="32" x2="180" y2="47" stroke="black" marker-end="url(#a7)"/>

  <!-- S9 -->
  <rect x="60" y="47" width="240" height="46" fill="white" stroke="black"/>
  <text x="180" y="63" text-anchor="middle">READ OBJECT DATA OF 2ND</text>
  <text x="180" y="75" text-anchor="middle">BLOCK GROUP FROM</text>
  <text x="180" y="87" text-anchor="middle">OBJECT DATA FILE</text>
  <text x="310" y="59" font-size="8">S9</text>
  <line x1="180" y1="93" x2="180" y2="110" stroke="black" marker-end="url(#a7)"/>

  <!-- S10 -->
  <rect x="60" y="110" width="240" height="36" fill="white" stroke="black"/>
  <text x="180" y="125" text-anchor="middle">DETERMINE BLOCK TO BE</text>
  <text x="180" y="137" text-anchor="middle">COLORED BASED ON MINUTE DATA</text>
  <text x="310" y="122" font-size="8">S10</text>
  <line x1="180" y1="146" x2="180" y2="163" stroke="black" marker-end="url(#a7)"/>

  <!-- S11 -->
  <rect x="60" y="163" width="240" height="36" fill="white" stroke="black"/>
  <text x="180" y="178" text-anchor="middle">DETERMINE AMOUNT OF COLORING</text>
  <text x="180" y="190" text-anchor="middle">BASED ON MINUTE DATA, SECOND DATA</text>
  <text x="310" y="175" font-size="8">S11</text>
  <line x1="180" y1="199" x2="180" y2="216" stroke="black" marker-end="url(#a7)"/>

  <!-- S12 -->
  <rect x="60" y="216" width="240" height="46" fill="white" stroke="black"/>
  <text x="180" y="232" text-anchor="middle">REWRITE VERTEX DATA IN RANGE</text>
  <text x="180" y="244" text-anchor="middle">DEPENDING ON AMOUNT OF COLORING</text>
  <text x="180" y="256" text-anchor="middle">OF VERTEX DATA OF BLOCK TO BE COLORED</text>
  <text x="310" y="228" font-size="8">S12</text>
  <line x1="180" y1="262" x2="180" y2="279" stroke="black" marker-end="url(#a7)"/>

  <!-- S13 -->
  <rect x="60" y="279" width="240" height="46" fill="white" stroke="black"/>
  <text x="180" y="295" text-anchor="middle">DETERMINE ANGULAR DISPLACEMENT</text>
  <text x="180" y="307" text-anchor="middle">ABOUT LONGITUDINAL AXIS OF BLOCK</text>
  <text x="180" y="319" text-anchor="middle">TO BE COLORED BASED ON CLOCK INFO</text>
  <text x="310" y="291" font-size="8">S13</text>
  <line x1="180" y1="325" x2="180" y2="342" stroke="black" marker-end="url(#a7)"/>

  <!-- S14 -->
  <rect x="60" y="342" width="240" height="36" fill="white" stroke="black"/>
  <text x="180" y="357" text-anchor="middle">REWRITE VERTEX DATA OF ALL BLOCKS</text>
  <text x="180" y="369" text-anchor="middle">OF 2ND BLOCK GROUP BASED ON ANG. DISP.</text>
  <text x="310" y="354" font-size="8">S14</text>
  <line x1="180" y1="378" x2="180" y2="395" stroke="black" marker-end="url(#a7)"/>

  <!-- S15 -->
  <rect x="60" y="395" width="240" height="46" fill="white" stroke="black"/>
  <text x="180" y="411" text-anchor="middle">RENDER ALL BLOCKS ACCORDING TO</text>
  <text x="180" y="423" text-anchor="middle">REFRACTING PROCESS, BUMP MAPPING</text>
  <text x="180" y="435" text-anchor="middle">PROCESS, AND STORE IMAGE DATA IN MEM</text>
  <text x="310" y="407" font-size="8">S15</text>
  <line x1="180" y1="441" x2="180" y2="458" stroke="black" marker-end="url(#a7)"/>

  <!-- S16 -->
  <rect x="60" y="458" width="240" height="36" fill="white" stroke="black"/>
  <text x="180" y="473" text-anchor="middle">OUTPUT 3D IMAGE DATA STORED IN</text>
  <text x="180" y="485" text-anchor="middle">IMAGE MEMORY TO DISPLAY MONITOR</text>
  <text x="310" y="470" font-size="8">S16</text>
  <line x1="180" y1="494" x2="180" y2="511" stroke="black" marker-end="url(#a7)"/>

  <!-- S17 Decision: END? -->
  <polygon points="180,511 260,530 180,549 100,530" fill="white" stroke="black"/>
  <text x="180" y="528" text-anchor="middle">END ?</text>
  <text x="310" y="527" font-size="8">S17</text>

  <!-- YES → END -->
  <line x1="180" y1="549" x2="180" y2="566" stroke="black" marker-end="url(#a7)"/>
  <text x="192" y="562" font-size="8">YES</text>
  <rect x="130" y="566" width="100" height="28" rx="14" fill="white" stroke="black"/>
  <text x="180" y="585" text-anchor="middle">END</text>

  <!-- NO → Connector (2) back to FIG.6 -->
  <line x1="100" y1="530" x2="30" y2="530" stroke="black"/>
  <text x="65" y="524" font-size="8">NO</text>
  <circle cx="30" cy="530" r="14" fill="white" stroke="black"/>
  <text x="30" y="535" text-anchor="middle" font-weight="bold">2</text>
</svg>

---

## FIG. 8 — Parameter Setting Screen (Menu + Clock Display)

<svg viewBox="0 0 500 520" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="10">
  <defs>
    <pattern id="diag8" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#999" stroke-width="1"/>
    </pattern>
    <marker id="a8" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- Screen border (18a) -->
  <rect x="10" y="10" width="470" height="460" fill="white" stroke="black" stroke-width="2"/>
  <text x="18" y="22" font-size="9">18a</text>

  <!-- Blurred block group 304 (circular, background) -->
  <!-- Dashed blocks radiating from center (320, 230) -->
  <g transform="translate(250,210)">
    <g transform="rotate(0)">  <rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(30)"> <rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(60)"> <rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <!-- 306a (colored, hatched) at α=30° -->
    <g transform="rotate(30)"> <rect x="-6" y="-120" width="12" height="70" fill="url(#diag8)" stroke="#666" stroke-dasharray="4,2"/></g>
    <g transform="rotate(90)"> <rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(120)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(150)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(180)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(210)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(240)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(270)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(300)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <g transform="rotate(330)"><rect x="-6" y="-120" width="12" height="70" fill="none" stroke="#aaa" stroke-dasharray="4,2"/></g>
    <!-- Date/time text in center (blurred / background) -->
    <text x="0" y="5" text-anchor="middle" font-size="14" fill="#ccc" font-weight="bold">1999/09/16</text>
    <text x="0" y="22" text-anchor="middle" font-size="14" fill="#ccc" font-weight="bold">13:06:00</text>
  </g>

  <!-- Dashed circles for block group reference -->
  <circle cx="250" cy="210" r="52" fill="none" stroke="#bbb" stroke-dasharray="4,3"/>
  <circle cx="250" cy="210" r="120" fill="none" stroke="#bbb" stroke-dasharray="4,3"/>

  <!-- Label 306a (colored block) -->
  <text x="108" y="118" font-size="9">306a</text>
  <line x1="128" y1="120" x2="218" y2="120" stroke="black" marker-end="url(#a8)"/>

  <!-- Label 306 (block group) -->
  <text x="280" y="80" font-size="9">306</text>
  <line x1="280" y1="82" x2="270" y2="92" stroke="black" marker-end="url(#a8)"/>

  <!-- Label 304 (block group overall) -->
  <text x="100" y="150" font-size="9">304</text>
  <line x1="116" y1="148" x2="155" y2="165" stroke="black" marker-end="url(#a8)"/>

  <!-- Label 308 (inner circle reference) -->
  <text x="240" y="245" font-size="9">308</text>

  <!-- Label 310 (outer dashes) -->
  <text x="350" y="215" font-size="9">310</text>
  <line x1="350" y1="213" x2="372" y2="212" stroke="black" marker-end="url(#a8)"/>

  <!-- Label 312 (dashed circle) -->
  <text x="355" y="175" font-size="9">312</text>
  <line x1="362" y1="177" x2="370" y2="186" stroke="black" marker-end="url(#a8)"/>

  <!-- CUBE GROUP (menu items) - 3 cubes at bottom -->
  <!-- Cube 1 (left, transparent) -->
  <polygon points="80,370 120,345 160,370 120,395" fill="white" stroke="black"/>
  <polygon points="120,345 160,320 200,345 160,370" fill="#eee" stroke="black"/>
  <polygon points="160,370 200,345 200,395 160,420" fill="#ddd" stroke="black"/>
  <text x="120" y="430" text-anchor="middle" font-size="9">302</text>

  <!-- Cube 2 (center, transparent) -->
  <polygon points="210,370 250,345 290,370 250,395" fill="white" stroke="black"/>
  <polygon points="250,345 290,320 330,345 290,370" fill="#eee" stroke="black"/>
  <polygon points="290,370 330,345 330,395 290,420" fill="#ddd" stroke="black"/>
  <text x="250" y="430" text-anchor="middle" font-size="9">302</text>

  <!-- Cube 3 (right, colored/selected = semitransparent blue indicated by hatching) -->
  <polygon points="340,370 380,345 420,370 380,395" fill="url(#diag8)" stroke="black"/>
  <polygon points="380,345 420,320 460,345 420,370" fill="#ccc" stroke="black"/>
  <polygon points="420,370 460,345 460,395 420,420" fill="#bbb" stroke="black"/>
  <text x="380" y="430" text-anchor="middle" font-size="9">302</text>

  <!-- Screen border label 316 (cube group 316) -->
  <path d="M 60,445 L 60,452 Q 60,456 65,456 L 245,456 Q 250,456 250,460 L 250,463
           L 250,460 Q 250,456 255,456 L 435,456 Q 440,456 440,452 L 440,445"
        fill="none" stroke="black" stroke-width="1.5"/>
  <text x="250" y="475" text-anchor="middle">316</text>
</svg>

---

## FIG. 9 — Clock Display (Menu Erased)

<svg viewBox="0 0 460 480" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="10">
  <defs>
    <pattern id="diag9" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#555" stroke-width="1.2"/>
    </pattern>
    <marker id="a9" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- Screen border -->
  <rect x="10" y="10" width="430" height="430" fill="white" stroke="black" stroke-width="2"/>
  <text x="18" y="22" font-size="9">18a</text>

  <!-- Dashed reference circles -->
  <circle cx="230" cy="225" r="55" fill="none" stroke="#888" stroke-dasharray="5,3"/>
  <circle cx="230" cy="225" r="130" fill="none" stroke="#888" stroke-dasharray="5,3"/>

  <!-- Block group 304: 12 solid blocks radiating -->
  <g transform="translate(230,225)">
    <g transform="rotate(0)">  <rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <!-- 306a colored at α=30° -->
    <g transform="rotate(30)"> <rect x="-7" y="-130" width="14" height="78" fill="url(#diag9)" stroke="black"/></g>
    <g transform="rotate(60)"> <rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(90)"> <rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(120)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(150)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(180)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(210)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(240)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(270)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(300)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
    <g transform="rotate(330)"><rect x="-7" y="-130" width="14" height="78" fill="white" stroke="black"/></g>
  </g>

  <!-- Light spot paths (curvy lines) inside inner circle -->
  <path d="M 200,210 Q 240,180 270,230 Q 290,270 250,255 Q 210,240 230,200 Q 250,165 275,215"
        fill="none" stroke="black" stroke-width="1"/>
  <path d="M 215,240 Q 255,260 260,220 Q 265,185 235,200 Q 205,215 225,245"
        fill="none" stroke="black" stroke-width="1"/>

  <!-- Light spot circles -->
  <circle cx="230" cy="168" r="4" fill="white" stroke="black"/>
  <circle cx="278" cy="200" r="4" fill="white" stroke="black"/>
  <circle cx="275" cy="252" r="4" fill="white" stroke="black"/>
  <circle cx="230" cy="278" r="4" fill="white" stroke="black"/>
  <circle cx="185" cy="252" r="4" fill="white" stroke="black"/>
  <circle cx="182" cy="198" r="4" fill="white" stroke="black"/>

  <!-- Labels -->
  <text x="104" y="155" font-size="9">306a</text>
  <line x1="130" y1="157" x2="210" y2="145" stroke="black" marker-end="url(#a9)"/>

  <text x="105" y="195" font-size="9">304</text>
  <line x1="120" y1="195" x2="160" y2="195" stroke="black" marker-end="url(#a9)"/>

  <text x="305" y="190" font-size="9">306</text>
  <line x1="305" y1="192" x2="295" y2="198" stroke="black" marker-end="url(#a9)"/>

  <text x="236" y="268" font-size="9">308</text>
  <text x="345" y="230" font-size="9">310</text>
  <line x1="345" y1="232" x2="362" y2="232" stroke="black" marker-end="url(#a9)"/>

  <text x="348" y="180" font-size="9">312</text>
  <line x1="355" y1="182" x2="360" y2="192" stroke="black" marker-end="url(#a9)"/>

  <text x="230" y="330" font-size="9">314</text>
  <line x1="238" y1="328" x2="248" y2="318" stroke="black" marker-end="url(#a9)"/>

  <text x="150" y="348" font-size="9">314</text>
  <line x1="163" y1="346" x2="178" y2="336" stroke="black" marker-end="url(#a9)"/>
</svg>

---

## FIG. 10 — 3D Block Group with Light Spots

<svg viewBox="0 0 540 560" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="10">
  <defs>
    <pattern id="diag10" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#555" stroke-width="1.2"/>
    </pattern>
    <marker id="a10" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- 12 blocks as 3D prisms radiating from center (270,280) -->
  <g transform="translate(270,280)">
    <!-- 306a colored block (α=30°) with 3D top face -->
    <g transform="rotate(30)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="url(#diag10)" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#aaa" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#888" stroke="black" stroke-width="0.8"/>
    </g>
    <!-- Non-colored blocks (α=0,60,90,...,330) -->
    <g transform="rotate(0)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(60)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(90)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(120)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(150)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(180)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(210)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(240)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(270)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(300)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
    <g transform="rotate(330)">
      <polygon points="-7,-140 7,-140 7,-62 -7,-62" fill="white" stroke="black" stroke-width="0.8"/>
      <polygon points="-7,-140 -1,-145 13,-145 7,-140" fill="#ddd" stroke="black" stroke-width="0.8"/>
      <polygon points="7,-140 13,-145 13,-67 7,-62" fill="#bbb" stroke="black" stroke-width="0.8"/>
    </g>
  </g>

  <!-- Dashed sphere reference ellipse -->
  <ellipse cx="270" cy="280" rx="55" ry="45" fill="none" stroke="black" stroke-dasharray="5,3"/>

  <!-- Light spot orbit paths -->
  <ellipse cx="270" cy="280" rx="50" ry="30" fill="none" stroke="black" stroke-width="1"/>
  <ellipse cx="270" cy="280" rx="35" ry="50" fill="none" stroke="black" stroke-width="1"/>
  <ellipse cx="270" cy="280" rx="55" ry="20" fill="none" stroke="black" stroke-width="1"
           transform="rotate(30,270,280)"/>

  <!-- Light spots (small circles) -->
  <circle cx="270" cy="250" r="5" fill="white" stroke="black"/>
  <circle cx="315" cy="270" r="5" fill="white" stroke="black"/>
  <circle cx="310" cy="300" r="5" fill="white" stroke="black"/>
  <circle cx="265" cy="325" r="5" fill="white" stroke="black"/>
  <circle cx="225" cy="305" r="5" fill="white" stroke="black"/>
  <circle cx="228" cy="260" r="5" fill="white" stroke="black"/>

  <!-- Labels -->
  <text x="118" y="132" font-size="9">304</text>
  <line x1="138" y1="132" x2="165" y2="150" stroke="black" marker-end="url(#a10)"/>

  <text x="336" y="112" font-size="9">306</text>
  <line x1="356" y1="114" x2="350" y2="130" stroke="black" marker-end="url(#a10)"/>

  <text x="354" y="140" font-size="9">306</text>

  <text x="302" y="262" font-size="9">308</text>
  <line x1="312" y1="264" x2="318" y2="270" stroke="black" marker-end="url(#a10)"/>

  <text x="166" y="278" font-size="9">308</text>
  <line x1="183" y1="278" x2="233" y2="278" stroke="black" marker-end="url(#a10)"/>

  <text x="354" y="310" font-size="9">314</text>
  <line x1="354" y1="308" x2="318" y2="298" stroke="black" marker-end="url(#a10)"/>

  <text x="168" y="450" font-size="9">314</text>
  <line x1="182" y1="448" x2="225" y2="428" stroke="black" marker-end="url(#a10)"/>

  <text x="340" y="265" font-size="9">312</text>
  <line x1="350" y1="266" x2="324" y2="270" stroke="black" stroke-dasharray="3,2" marker-end="url(#a10)"/>

  <text x="360" y="330" font-size="9">310</text>
  <line x1="360" y1="328" x2="325" y2="310" stroke="black" marker-end="url(#a10)"/>
</svg>

---

## FIG. 11 — Parameter Setting Changing Means (Functional Block Diagram)

<svg viewBox="0 0 680 520" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a11" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- PROGRAM ACTIVATING MEANS 320 -->
  <rect x="10" y="200" width="110" height="50" fill="white" stroke="black"/>
  <text x="65" y="220" text-anchor="middle">PROGRAM</text>
  <text x="65" y="232" text-anchor="middle">ACTIVATING</text>
  <text x="65" y="244" text-anchor="middle">MEANS</text>
  <text x="100" y="197" font-size="9">320</text>

  <!-- INPUT DEVICE 32 -->
  <rect x="10" y="360" width="110" height="35" fill="white" stroke="black"/>
  <text x="65" y="378" text-anchor="middle">INPUT DEVICE</text>
  <text x="100" y="358" font-size="9">32</text>

  <!-- KEY INPUT DETERMINING MEANS 324 -->
  <rect x="145" y="350" width="110" height="50" fill="white" stroke="black"/>
  <text x="200" y="368" text-anchor="middle">KEY INPUT</text>
  <text x="200" y="380" text-anchor="middle">DETERMINING</text>
  <text x="200" y="392" text-anchor="middle">MEANS</text>
  <text x="235" y="347" font-size="9">324</text>
  <line x1="120" y1="378" x2="145" y2="375" stroke="black" marker-end="url(#a11)"/>

  <!-- MENU SETTING MEANS 326 -->
  <rect x="280" y="350" width="110" height="50" fill="white" stroke="black"/>
  <text x="335" y="368" text-anchor="middle">MENU SETTING</text>
  <text x="335" y="380" text-anchor="middle">MEANS</text>
  <text x="370" y="347" font-size="9">326</text>
  <line x1="255" y1="375" x2="280" y2="375" stroke="black" marker-end="url(#a11)"/>

  <!-- MENU DISPLAYING MEANS 322 -->
  <rect x="145" y="200" width="110" height="50" fill="white" stroke="black"/>
  <text x="200" y="218" text-anchor="middle">MENU</text>
  <text x="200" y="230" text-anchor="middle">DISPLAYING</text>
  <text x="200" y="242" text-anchor="middle">MEANS</text>
  <text x="235" y="197" font-size="9">322</text>
  <line x1="120" y1="220" x2="145" y2="220" stroke="black" marker-end="url(#a11)"/>
  <line x1="200" y1="250" x2="200" y2="350" stroke="black" stroke-width="1"/>

  <!-- MEASURED QUANTITY DISPLAYING MEANS 328 -->
  <rect x="145" y="90" width="110" height="60" fill="white" stroke="black"/>
  <text x="200" y="108" text-anchor="middle">MEASURED</text>
  <text x="200" y="120" text-anchor="middle">QUANTITY</text>
  <text x="200" y="132" text-anchor="middle">DISPLAYING</text>
  <text x="200" y="144" text-anchor="middle">MEANS</text>
  <text x="235" y="88" font-size="9">328</text>
  <line x1="120" y1="215" x2="200" y2="150" stroke="black" marker-end="url(#a11)"/>

  <!-- DISPLAY MONITOR 18 -->
  <rect x="10" y="30" width="110" height="35" fill="white" stroke="black"/>
  <text x="65" y="48" text-anchor="middle">DISPLAY</text>
  <text x="65" y="60" text-anchor="middle">MONITOR</text>
  <text x="100" y="28" font-size="9">18</text>
  <line x1="200" y1="90" x2="120" y2="65" stroke="black" marker-end="url(#a11)"/>
  <line x1="200" y1="200" x2="120" y2="65" stroke="black" marker-end="url(#a11)"/>

  <!-- COLORING INSTRUCTING MEANS 330 -->
  <rect x="415" y="350" width="110" height="50" fill="white" stroke="black"/>
  <text x="470" y="368" text-anchor="middle">COLORING</text>
  <text x="470" y="380" text-anchor="middle">INSTRUCTING</text>
  <text x="470" y="392" text-anchor="middle">MEANS</text>
  <text x="505" y="347" font-size="9">330</text>
  <line x1="390" y1="370" x2="415" y2="370" stroke="black" marker-end="url(#a11)"/>
  <line x1="470" y1="350" x2="200" y2="250" stroke="black" marker-end="url(#a11)"/>

  <!-- ITEM DISPLAY INSTRUCTING MEANS 332 -->
  <rect x="550" y="350" width="115" height="50" fill="white" stroke="black"/>
  <text x="607" y="368" text-anchor="middle">ITEM DISPLAY</text>
  <text x="607" y="380" text-anchor="middle">INSTRUCTING</text>
  <text x="607" y="392" text-anchor="middle">MEANS</text>
  <text x="645" y="347" font-size="9">332</text>
  <line x1="525" y1="370" x2="550" y2="370" stroke="black" marker-end="url(#a11)"/>

  <!-- BLURRING SETTING/CANCELING MEANS 334 -->
  <rect x="550" y="175" width="115" height="55" fill="white" stroke="black"/>
  <text x="607" y="193" text-anchor="middle">BLURRING</text>
  <text x="607" y="205" text-anchor="middle">SETTING/</text>
  <text x="607" y="217" text-anchor="middle">CANCELING</text>
  <text x="607" y="229" text-anchor="middle">MEANS</text>
  <text x="645" y="173" font-size="9">334</text>
  <line x1="607" y1="230" x2="607" y2="350" stroke="black" stroke-width="1"/>
  <line x1="607" y1="175" x2="200" y2="150" stroke="black" marker-end="url(#a11)"/>

  <!-- MENU CANCELLATION INSTRUCTING MEANS 336 -->
  <rect x="415" y="175" width="120" height="55" fill="white" stroke="black"/>
  <text x="475" y="193" text-anchor="middle">MENU</text>
  <text x="475" y="205" text-anchor="middle">CANCELLATION</text>
  <text x="475" y="217" text-anchor="middle">INSTRUCTING</text>
  <text x="475" y="229" text-anchor="middle">MEANS</text>
  <text x="515" y="173" font-size="9">336</text>
  <line x1="475" y1="230" x2="475" y2="350" stroke="black" stroke-width="1"/>
  <line x1="475" y1="175" x2="255" y2="250" stroke="black" marker-end="url(#a11)"/>

  <!-- END DETERMINING MEANS 338 -->
  <rect x="415" y="90" width="120" height="50" fill="white" stroke="black"/>
  <text x="475" y="108" text-anchor="middle">END</text>
  <text x="475" y="120" text-anchor="middle">DETERMINING</text>
  <text x="475" y="132" text-anchor="middle">MEANS</text>
  <text x="515" y="88" font-size="9">338</text>
  <line x1="475" y1="140" x2="65" y2="200" stroke="black" marker-end="url(#a11)"/>
  <line x1="475" y1="90" x2="120" y2="50" stroke="black" marker-end="url(#a11)"/>

  <!-- 300 label -->
  <rect x="4" y="4" width="670" height="510" fill="none" stroke="black" stroke-dasharray="8,4"/>
  <text x="340" y="498" text-anchor="middle" font-size="10" font-weight="bold">300</text>
</svg>

---

## FIG. 12 — Menu Displaying Means (Functional Block Diagram)

<svg viewBox="0 0 700 520" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a12" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- OBJECT DATA FILE 204 -->
  <rect x="10" y="420" width="90" height="40" fill="white" stroke="black" stroke-dasharray="4,2"/>
  <text x="55" y="437" text-anchor="middle">OBJECT DATA</text>
  <text x="55" y="449" text-anchor="middle">FILE</text>
  <text x="80" y="418" font-size="9">204</text>

  <!-- OBJECT DATA READING MEANS 342 -->
  <rect x="120" y="360" width="100" height="50" fill="white" stroke="black"/>
  <text x="170" y="378" text-anchor="middle">OBJECT DATA</text>
  <text x="170" y="390" text-anchor="middle">READING</text>
  <text x="170" y="402" text-anchor="middle">MEANS</text>
  <text x="200" y="358" font-size="9">342</text>
  <line x1="55" y1="420" x2="170" y2="410" stroke="black" marker-end="url(#a12)"/>

  <!-- COLORING INFO READING MEANS 344 -->
  <rect x="240" y="360" width="100" height="50" fill="white" stroke="black"/>
  <text x="290" y="378" text-anchor="middle">COLORING</text>
  <text x="290" y="390" text-anchor="middle">INFORMATION</text>
  <text x="290" y="402" text-anchor="middle">READING MEANS</text>
  <text x="325" y="358" font-size="9">344</text>

  <!-- MOTION INFORMATION TABLE 346 -->
  <rect x="10" y="340" width="90" height="40" fill="white" stroke="black" stroke-dasharray="4,2"/>
  <text x="55" y="357" text-anchor="middle">MOTION INFO.</text>
  <text x="55" y="369" text-anchor="middle">TABLE</text>
  <text x="80" y="338" font-size="9">346</text>

  <!-- 1ST MOTION INFO READING MEANS 348 -->
  <rect x="120" y="270" width="100" height="60" fill="white" stroke="black"/>
  <text x="170" y="288" text-anchor="middle">1ST MOTION</text>
  <text x="170" y="300" text-anchor="middle">INFORMATION</text>
  <text x="170" y="312" text-anchor="middle">READING</text>
  <text x="170" y="324" text-anchor="middle">MEANS</text>
  <text x="200" y="268" font-size="9">348</text>
  <line x1="100" y1="355" x2="170" y2="330" stroke="black" marker-end="url(#a12)"/>

  <!-- 2ND MOTION INFO READING MEANS 350 -->
  <rect x="240" y="270" width="100" height="60" fill="white" stroke="black"/>
  <text x="290" y="288" text-anchor="middle">2ND MOTION</text>
  <text x="290" y="300" text-anchor="middle">INFORMATION</text>
  <text x="290" y="312" text-anchor="middle">READING</text>
  <text x="290" y="324" text-anchor="middle">MEANS</text>
  <text x="325" y="268" font-size="9">350</text>

  <!-- OBJECT DATA 340 -->
  <rect x="360" y="360" width="90" height="40" fill="white" stroke="black" stroke-dasharray="4,2"/>
  <text x="405" y="377" text-anchor="middle">OBJECT</text>
  <text x="405" y="389" text-anchor="middle">DATA</text>
  <text x="430" y="358" font-size="9">340</text>

  <!-- VERTEX DATA REWRITING MEANS 352 -->
  <rect x="365" y="270" width="100" height="60" fill="white" stroke="black"/>
  <text x="415" y="288" text-anchor="middle">VERTEX DATA</text>
  <text x="415" y="300" text-anchor="middle">REWRITING</text>
  <text x="415" y="312" text-anchor="middle">MEANS</text>
  <text x="445" y="268" font-size="9">352</text>
  <line x1="220" y1="300" x2="365" y2="300" stroke="black" marker-end="url(#a12)"/>
  <line x1="340" y1="300" x2="365" y2="300" stroke="black" marker-end="url(#a12)"/>
  <line x1="170" y1="360" x2="405" y2="400" stroke="black" marker-end="url(#a12)"/>
  <line x1="405" y1="360" x2="415" y2="330" stroke="black" marker-end="url(#a12)"/>

  <!-- CUBE GROUP RENDERING MEANS 354 -->
  <rect x="480" y="270" width="100" height="60" fill="white" stroke="black"/>
  <text x="530" y="288" text-anchor="middle">CUBE GROUP</text>
  <text x="530" y="300" text-anchor="middle">RENDERING</text>
  <text x="530" y="312" text-anchor="middle">MEANS</text>
  <text x="560" y="268" font-size="9">354</text>
  <line x1="465" y1="300" x2="480" y2="300" stroke="black" marker-end="url(#a12)"/>

  <!-- IMAGE MEMORY 74 -->
  <rect x="490" y="175" width="90" height="35" fill="white" stroke="black"/>
  <text x="535" y="193" text-anchor="middle">IMAGE</text>
  <text x="535" y="205" text-anchor="middle">MEMORY</text>
  <text x="565" y="173" font-size="9">74</text>
  <line x1="530" y1="270" x2="530" y2="210" stroke="black" marker-end="url(#a12)"/>

  <!-- ITEM DISPLAYING MEANS 356 -->
  <rect x="365" y="175" width="100" height="55" fill="white" stroke="black"/>
  <text x="415" y="193" text-anchor="middle">ITEM</text>
  <text x="415" y="205" text-anchor="middle">DISPLAYING</text>
  <text x="415" y="217" text-anchor="middle">MEANS</text>
  <text x="445" y="173" font-size="9">356</text>
  <line x1="415" y1="230" x2="530" y2="175" stroke="black" marker-end="url(#a12)"/>

  <!-- ITEM DISPLAY INSTRUCTING MEANS 332 (input) -->
  <rect x="250" y="175" width="100" height="55" fill="white" stroke="black"/>
  <text x="300" y="193" text-anchor="middle">ITEM DISPLAY</text>
  <text x="300" y="205" text-anchor="middle">INSTRUCTING</text>
  <text x="300" y="217" text-anchor="middle">MEANS</text>
  <text x="330" y="173" font-size="9">332</text>
  <line x1="350" y1="200" x2="365" y2="200" stroke="black" marker-end="url(#a12)"/>

  <!-- IMAGE DATA OUTPUTTING MEANS 358 -->
  <rect x="490" y="100" width="100" height="50" fill="white" stroke="black"/>
  <text x="540" y="118" text-anchor="middle">IMAGE DATA</text>
  <text x="540" y="130" text-anchor="middle">OUTPUTTING</text>
  <text x="540" y="142" text-anchor="middle">MEANS</text>
  <text x="572" y="98" font-size="9">358</text>
  <line x1="535" y1="175" x2="535" y2="150" stroke="black" marker-end="url(#a12)"/>

  <!-- DISPLAY MONITOR 18 -->
  <rect x="490" y="40" width="100" height="35" fill="white" stroke="black"/>
  <text x="540" y="58" text-anchor="middle">DISPLAY</text>
  <text x="540" y="70" text-anchor="middle">MONITOR</text>
  <text x="572" y="38" font-size="9">18</text>
  <line x1="540" y1="100" x2="540" y2="75" stroke="black" marker-end="url(#a12)"/>

  <!-- END DETERMINING MEANS 360 -->
  <rect x="365" y="90" width="100" height="55" fill="white" stroke="black"/>
  <text x="415" y="108" text-anchor="middle">END</text>
  <text x="415" y="120" text-anchor="middle">DETERMINING</text>
  <text x="415" y="132" text-anchor="middle">MEANS</text>
  <text x="445" y="88" font-size="9">360</text>
  <line x1="540" y1="100" x2="415" y2="145" stroke="black" marker-end="url(#a12)"/>

  <!-- MENU IMAGE CANCELING MEANS 362 -->
  <rect x="250" y="90" width="100" height="55" fill="white" stroke="black"/>
  <text x="300" y="108" text-anchor="middle">MENU IMAGE</text>
  <text x="300" y="120" text-anchor="middle">CANCELING</text>
  <text x="300" y="132" text-anchor="middle">MEANS</text>
  <text x="330" y="88" font-size="9">362</text>
  <line x1="365" y1="120" x2="350" y2="120" stroke="black" marker-end="url(#a12)"/>

  <!-- MENU CANCELLATION INSTRUCTING MEANS 336 (input) -->
  <rect x="120" y="90" width="110" height="55" fill="white" stroke="black"/>
  <text x="175" y="108" text-anchor="middle">MENU</text>
  <text x="175" y="120" text-anchor="middle">CANCELLATION</text>
  <text x="175" y="132" text-anchor="middle">INSTRUCTING</text>
  <text x="175" y="144" text-anchor="middle">MEANS</text>
  <text x="208" y="88" font-size="9">336</text>
  <line x1="230" y1="120" x2="250" y2="120" stroke="black" marker-end="url(#a12)"/>

  <!-- 322 label -->
  <rect x="4" y="4" width="690" height="510" fill="none" stroke="black" stroke-dasharray="8,4"/>
  <text x="345" y="498" text-anchor="middle" font-size="10" font-weight="bold">322</text>
</svg>

---

## FIG. 13 — Measured Quantity Displaying Means, 2nd Embodiment

<svg viewBox="0 0 740 580" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="8.5">
  <defs>
    <marker id="a13" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- RTC 28 -->
  <rect x="10" y="480" width="60" height="30" fill="white" stroke="black"/>
  <text x="40" y="498" text-anchor="middle">RTC</text>
  <text x="55" y="478" font-size="8">28</text>

  <!-- CLOCK INFO READING MEANS 376 -->
  <rect x="85" y="390" width="100" height="50" fill="white" stroke="black"/>
  <text x="135" y="408" text-anchor="middle">CLOCK</text>
  <text x="135" y="420" text-anchor="middle">INFORMATION</text>
  <text x="135" y="432" text-anchor="middle">READING MEANS</text>
  <text x="168" y="388" font-size="8">376</text>
  <line x1="40" y1="480" x2="135" y2="440" stroke="black" marker-end="url(#a13)"/>

  <!-- OBJECT DATA FILE 204 -->
  <rect x="10" y="330" width="65" height="40" fill="white" stroke="black" stroke-dasharray="3,2"/>
  <text x="42" y="347" text-anchor="middle">OBJECT</text>
  <text x="42" y="359" text-anchor="middle">DATA FILE</text>
  <text x="60" y="328" font-size="8">204</text>

  <!-- OBJECT DATA READING MEANS 374 -->
  <rect x="85" y="320" width="100" height="50" fill="white" stroke="black"/>
  <text x="135" y="338" text-anchor="middle">OBJECT DATA</text>
  <text x="135" y="350" text-anchor="middle">READING</text>
  <text x="135" y="362" text-anchor="middle">MEANS</text>
  <text x="168" y="318" font-size="8">374</text>
  <line x1="75" y1="350" x2="85" y2="345" stroke="black" marker-end="url(#a13)"/>

  <!-- COLORING BLOCK DET. MEANS 378 -->
  <rect x="205" y="390" width="110" height="50" fill="white" stroke="black"/>
  <text x="260" y="408" text-anchor="middle">COLORING BLOCK</text>
  <text x="260" y="420" text-anchor="middle">DETERMINING</text>
  <text x="260" y="432" text-anchor="middle">MEANS</text>
  <text x="295" y="388" font-size="8">378</text>
  <line x1="185" y1="415" x2="205" y2="415" stroke="black" marker-end="url(#a13)"/>

  <!-- AMOUNT-OF-COLORING DET. 380 -->
  <rect x="205" y="320" width="110" height="50" fill="white" stroke="black"/>
  <text x="260" y="338" text-anchor="middle">AMOUNT-OF-</text>
  <text x="260" y="350" text-anchor="middle">COLORING DET.</text>
  <text x="260" y="362" text-anchor="middle">MEANS</text>
  <text x="295" y="318" font-size="8">380</text>
  <line x1="185" y1="345" x2="205" y2="345" stroke="black" marker-end="url(#a13)"/>

  <!-- 1ST ANGULAR DISPLACEMENT DET. 382 -->
  <rect x="205" y="250" width="110" height="50" fill="white" stroke="black"/>
  <text x="260" y="268" text-anchor="middle">1ST ANGULAR</text>
  <text x="260" y="280" text-anchor="middle">DISPLACEMENT</text>
  <text x="260" y="292" text-anchor="middle">DET. MEANS</text>
  <text x="295" y="248" font-size="8">382</text>
  <line x1="185" y1="270" x2="205" y2="270" stroke="black" marker-end="url(#a13)"/>

  <!-- 2ND ANGULAR DISPLACEMENT DET. 384 -->
  <rect x="205" y="180" width="110" height="50" fill="white" stroke="black"/>
  <text x="260" y="198" text-anchor="middle">2ND ANGULAR</text>
  <text x="260" y="210" text-anchor="middle">DISPLACEMENT</text>
  <text x="260" y="222" text-anchor="middle">DET. MEANS</text>
  <text x="295" y="178" font-size="8">384</text>
  <line x1="185" y1="205" x2="205" y2="205" stroke="black" marker-end="url(#a13)"/>

  <!-- OBJECT DATA 370 -->
  <rect x="330" y="380" width="90" height="35" fill="white" stroke="black" stroke-dasharray="3,2"/>
  <text x="375" y="397" text-anchor="middle">OBJECT DATA</text>
  <text x="405" y="378" font-size="8">370</text>

  <!-- 1ST VERTEX DATA REWRITING 386 -->
  <rect x="335" y="290" width="100" height="60" fill="white" stroke="black"/>
  <text x="385" y="308" text-anchor="middle">1ST VERTEX</text>
  <text x="385" y="320" text-anchor="middle">DATA</text>
  <text x="385" y="332" text-anchor="middle">REWRITING</text>
  <text x="385" y="344" text-anchor="middle">MEANS</text>
  <text x="415" y="288" font-size="8">386</text>
  <line x1="315" y1="415" x2="385" y2="350" stroke="black" marker-end="url(#a13)"/>
  <line x1="315" y1="345" x2="335" y2="330" stroke="black" marker-end="url(#a13)"/>
  <line x1="315" y1="275" x2="335" y2="315" stroke="black" marker-end="url(#a13)"/>
  <line x1="315" y1="205" x2="335" y2="310" stroke="black" marker-end="url(#a13)"/>
  <line x1="385" y1="380" x2="385" y2="350" stroke="black" stroke-width="0.8"/>

  <!-- BLOCK GROUP RENDERING 388 -->
  <rect x="450" y="290" width="100" height="60" fill="white" stroke="black"/>
  <text x="500" y="308" text-anchor="middle">BLOCK GROUP</text>
  <text x="500" y="320" text-anchor="middle">RENDERING</text>
  <text x="500" y="332" text-anchor="middle">MEANS</text>
  <text x="530" y="288" font-size="8">388</text>
  <line x1="435" y1="320" x2="450" y2="320" stroke="black" marker-end="url(#a13)"/>

  <!-- MOTION INFO TABLE 390 -->
  <rect x="10" y="200" width="65" height="40" fill="white" stroke="black" stroke-dasharray="3,2"/>
  <text x="42" y="217" text-anchor="middle">MOTION INFO</text>
  <text x="42" y="229" text-anchor="middle">TABLE</text>
  <text x="60" y="198" font-size="8">390</text>

  <!-- MOTION INFO READING 392 -->
  <rect x="85" y="190" width="100" height="50" fill="white" stroke="black"/>
  <text x="135" y="208" text-anchor="middle">MOTION</text>
  <text x="135" y="220" text-anchor="middle">INFORMATION</text>
  <text x="135" y="232" text-anchor="middle">READING MEANS</text>
  <text x="168" y="188" font-size="8">392</text>
  <line x1="75" y1="220" x2="85" y2="215" stroke="black" marker-end="url(#a13)"/>

  <!-- OBJECT DATA 372 -->
  <rect x="330" y="155" width="90" height="35" fill="white" stroke="black" stroke-dasharray="3,2"/>
  <text x="375" y="172" text-anchor="middle">OBJECT DATA</text>
  <text x="405" y="153" font-size="8">372</text>

  <!-- 2ND VERTEX DATA REWRITING 394 -->
  <rect x="335" y="90" width="100" height="55" fill="white" stroke="black"/>
  <text x="385" y="108" text-anchor="middle">2ND VERTEX</text>
  <text x="385" y="120" text-anchor="middle">DATA REWRITING</text>
  <text x="385" y="132" text-anchor="middle">MEANS</text>
  <text x="415" y="88" font-size="8">394</text>
  <line x1="185" y1="215" x2="385" y2="145" stroke="black" marker-end="url(#a13)"/>
  <line x1="375" y1="155" x2="385" y2="145" stroke="black" stroke-width="0.8"/>

  <!-- LIGHT SPOT GROUP RENDERING 396 -->
  <rect x="450" y="170" width="100" height="60" fill="white" stroke="black"/>
  <text x="500" y="188" text-anchor="middle">LIGHT SPOT</text>
  <text x="500" y="200" text-anchor="middle">GROUP</text>
  <text x="500" y="212" text-anchor="middle">RENDERING</text>
  <text x="500" y="224" text-anchor="middle">MEANS</text>
  <text x="530" y="168" font-size="8">396</text>
  <line x1="435" y1="120" x2="450" y2="190" stroke="black" marker-end="url(#a13)"/>

  <!-- IMAGE MEMORY 74 -->
  <rect x="565" y="250" width="90" height="35" fill="white" stroke="black"/>
  <text x="610" y="268" text-anchor="middle">IMAGE MEMORY</text>
  <text x="635" y="248" font-size="8">74</text>
  <line x1="550" y1="320" x2="610" y2="285" stroke="black" marker-end="url(#a13)"/>
  <line x1="550" y1="200" x2="610" y2="260" stroke="black" marker-end="url(#a13)"/>

  <!-- BLURRING SETTING/CANCELING 334 -->
  <rect x="565" y="155" width="115" height="55" fill="white" stroke="black"/>
  <text x="622" y="173" text-anchor="middle">BLURRING</text>
  <text x="622" y="185" text-anchor="middle">SETTING/</text>
  <text x="622" y="197" text-anchor="middle">CANCELING</text>
  <text x="622" y="209" text-anchor="middle">MEANS</text>
  <text x="655" y="153" font-size="8">334</text>

  <!-- BLURRING PROCESSING 398 -->
  <rect x="565" y="355" width="115" height="55" fill="white" stroke="black"/>
  <text x="622" y="373" text-anchor="middle">BLURRING</text>
  <text x="622" y="385" text-anchor="middle">PROCESSING</text>
  <text x="622" y="397" text-anchor="middle">MEANS</text>
  <text x="655" y="353" font-size="8">398</text>
  <line x1="622" y1="210" x2="622" y2="355" stroke="black" marker-end="url(#a13)"/>
  <line x1="610" y1="285" x2="622" y2="355" stroke="black" marker-end="url(#a13)"/>

  <!-- IMAGE DATA OUTPUTTING 400 -->
  <rect x="565" y="450" width="115" height="50" fill="white" stroke="black"/>
  <text x="622" y="468" text-anchor="middle">IMAGE DATA</text>
  <text x="622" y="480" text-anchor="middle">OUTPUTTING</text>
  <text x="622" y="492" text-anchor="middle">MEANS</text>
  <text x="655" y="448" font-size="8">400</text>
  <line x1="622" y1="410" x2="622" y2="450" stroke="black" marker-end="url(#a13)"/>

  <!-- DISPLAY MONITOR 18 -->
  <rect x="565" y="55" width="115" height="35" fill="white" stroke="black"/>
  <text x="622" y="73" text-anchor="middle">DISPLAY MONITOR</text>
  <text x="655" y="53" font-size="8">18</text>
  <line x1="622" y1="155" x2="622" y2="90" stroke="black" marker-end="url(#a13)"/>
  <line x1="622" y1="450" x2="622" y2="90" stroke="black" marker-end="url(#a13)"/>

  <!-- END DETERMINING MEANS 402 -->
  <rect x="450" y="450" width="100" height="55" fill="white" stroke="black"/>
  <text x="500" y="468" text-anchor="middle">END</text>
  <text x="500" y="480" text-anchor="middle">DETERMINING</text>
  <text x="500" y="492" text-anchor="middle">MEANS</text>
  <text x="530" y="448" font-size="8">402</text>
  <line x1="565" y1="475" x2="550" y2="475" stroke="black" marker-end="url(#a13)"/>

  <!-- 328 label -->
  <rect x="4" y="4" width="730" height="570" fill="none" stroke="black" stroke-dasharray="8,4"/>
  <text x="365" y="558" text-anchor="middle" font-size="10" font-weight="bold">328</text>
</svg>

---

## FIG. 14 — Parameter Setting Changing Means Flowchart

<svg viewBox="0 0 420 780" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a14" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- START -->
  <rect x="140" y="8" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="200" y="26" text-anchor="middle">START</text>
  <line x1="200" y1="34" x2="200" y2="50" stroke="black" marker-end="url(#a14)"/>

  <!-- S101: ACTIVATE MENU DISPLAYING MEANS -->
  <rect x="70" y="50" width="260" height="36" fill="white" stroke="black"/>
  <text x="200" y="64" text-anchor="middle">ACTIVATE MENU</text>
  <text x="200" y="76" text-anchor="middle">DISPLAYING MEANS</text>
  <text x="338" y="62" font-size="8">S101</text>
  <line x1="200" y1="86" x2="200" y2="103" stroke="black" marker-end="url(#a14)"/>

  <!-- S102: INPUT? -->
  <polygon points="200,103 280,122 200,141 120,122" fill="white" stroke="black"/>
  <text x="200" y="120" text-anchor="middle">INPUT ?</text>
  <text x="290" y="120" font-size="8">S102</text>
  <!-- NO loop back to top -->
  <line x1="120" y1="122" x2="50" y2="122" stroke="black"/>
  <text x="82" y="118" font-size="8">NO</text>
  <line x1="50" y1="122" x2="50" y2="68" stroke="black"/>
  <line x1="50" y1="68" x2="70" y2="68" stroke="black" marker-end="url(#a14)"/>
  <!-- YES -->
  <line x1="200" y1="141" x2="200" y2="158" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="154" font-size="8">YES</text>

  <!-- S103: INDICATE CUBE TO BE COLORED -->
  <rect x="70" y="158" width="260" height="36" fill="white" stroke="black"/>
  <text x="200" y="172" text-anchor="middle">INDICATE CUBE TO BE COLORED</text>
  <text x="338" y="170" font-size="8">S103</text>
  <line x1="200" y1="194" x2="200" y2="211" stroke="black" marker-end="url(#a14)"/>

  <!-- S104: INDICATE SELECTED ITEM -->
  <rect x="70" y="211" width="260" height="26" fill="white" stroke="black"/>
  <text x="200" y="228" text-anchor="middle">INDICATE SELECTED ITEM</text>
  <text x="338" y="222" font-size="8">S104</text>
  <line x1="200" y1="237" x2="200" y2="254" stroke="black" marker-end="url(#a14)"/>

  <!-- S105: TIME SETTING? -->
  <polygon points="200,254 280,273 200,292 120,273" fill="white" stroke="black"/>
  <text x="200" y="270" text-anchor="middle">TIME SETTING ?</text>
  <text x="290" y="270" font-size="8">S105</text>
  <!-- NO → S115 -->
  <line x1="280" y1="273" x2="370" y2="273" stroke="black"/>
  <text x="298" y="269" font-size="8">NO</text>
  <line x1="370" y1="273" x2="370" y2="480" stroke="black"/>
  <!-- YES -->
  <line x1="200" y1="292" x2="200" y2="309" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="305" font-size="8">YES</text>

  <!-- S106: INDICATE BLURRED DISPLAY -->
  <rect x="70" y="309" width="260" height="26" fill="white" stroke="black"/>
  <text x="200" y="326" text-anchor="middle">INDICATE BLURRED DISPLAY</text>
  <text x="338" y="320" font-size="8">S106</text>
  <line x1="200" y1="335" x2="200" y2="352" stroke="black" marker-end="url(#a14)"/>

  <!-- S107: ACTIVATE MEASURED QUANTITY DISPLAYING MEANS -->
  <rect x="70" y="352" width="260" height="36" fill="white" stroke="black"/>
  <text x="200" y="366" text-anchor="middle">ACTIVATE MEASURED</text>
  <text x="200" y="378" text-anchor="middle">QUANTITY DISPLAYING MEANS</text>
  <text x="338" y="364" font-size="8">S107</text>
  <line x1="200" y1="388" x2="200" y2="405" stroke="black" marker-end="url(#a14)"/>

  <!-- S108: INPUT? -->
  <polygon points="200,405 280,424 200,443 120,424" fill="white" stroke="black"/>
  <text x="200" y="422" text-anchor="middle">INPUT ?</text>
  <text x="290" y="422" font-size="8">S108</text>
  <!-- NO loop -->
  <line x1="120" y1="424" x2="60" y2="424" stroke="black"/>
  <text x="78" y="420" font-size="8">NO</text>
  <line x1="60" y1="424" x2="60" y2="390" stroke="black"/>
  <line x1="60" y1="390" x2="70" y2="390" stroke="black" marker-end="url(#a14)"/>
  <!-- YES -->
  <line x1="200" y1="443" x2="200" y2="460" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="456" font-size="8">YES</text>

  <!-- S109: NORMAL INPUT? -->
  <polygon points="200,460 280,479 200,498 120,479" fill="white" stroke="black"/>
  <text x="200" y="477" text-anchor="middle">NORMAL INPUT ?</text>
  <text x="290" y="477" font-size="8">S109</text>
  <!-- S115: PERFORM OTHER PROCESS -->
  <rect x="375" y="462" width="35" height="36" fill="white" stroke="black"/>
  <text x="392" y="475" text-anchor="middle" font-size="7">PERFORM</text>
  <text x="392" y="485" text-anchor="middle" font-size="7">OTHER</text>
  <text x="392" y="495" text-anchor="middle" font-size="7">PROCESS</text>
  <text x="392" y="458" font-size="7">S115</text>
  <line x1="370" y1="480" x2="375" y2="480" stroke="black" marker-end="url(#a14)"/>
  <!-- YES → S110 -->
  <line x1="200" y1="498" x2="200" y2="515" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="511" font-size="8">YES</text>
  <!-- NO → S111 -->
  <line x1="120" y1="479" x2="55" y2="479" stroke="black"/>
  <text x="73" y="475" font-size="8">NO</text>
  <line x1="55" y1="479" x2="55" y2="545" stroke="black"/>
  <rect x="20" y="545" width="70" height="26" fill="white" stroke="black"/>
  <text x="55" y="558" text-anchor="middle" font-size="7">DISPLAY ERROR</text>
  <text x="55" y="567" text-anchor="middle" font-size="7">MESSAGE</text>
  <text x="55" y="542" font-size="7">S111</text>
  <line x1="90" y1="558" x2="200" y2="558" stroke="black" marker-end="url(#a14)"/>

  <!-- S110: WRITE SET TIME -->
  <rect x="70" y="515" width="260" height="26" fill="white" stroke="black"/>
  <text x="200" y="532" text-anchor="middle">WRITE SET TIME</text>
  <text x="338" y="526" font-size="8">S110</text>
  <line x1="200" y1="541" x2="200" y2="558" stroke="black" marker-end="url(#a14)"/>

  <!-- S112: SETTING ENDED? -->
  <polygon points="200,558 280,577 200,596 120,577" fill="white" stroke="black"/>
  <text x="200" y="575" text-anchor="middle">SETTING ENDED ?</text>
  <text x="290" y="575" font-size="8">S112</text>
  <!-- NO loop back to S108 -->
  <line x1="120" y1="577" x2="40" y2="577" stroke="black"/>
  <text x="58" y="573" font-size="8">NO</text>
  <line x1="40" y1="577" x2="40" y2="424" stroke="black"/>
  <line x1="40" y1="424" x2="120" y2="424" stroke="black" marker-end="url(#a14)"/>
  <!-- YES -->
  <line x1="200" y1="596" x2="200" y2="613" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="609" font-size="8">YES</text>

  <!-- S113: INDICATE MENU IMAGE CANCELLATION -->
  <rect x="70" y="613" width="260" height="26" fill="white" stroke="black"/>
  <text x="200" y="630" text-anchor="middle">INDICATE MENU IMAGE CANCELLATION</text>
  <text x="338" y="624" font-size="8">S113</text>
  <line x1="200" y1="639" x2="200" y2="656" stroke="black" marker-end="url(#a14)"/>

  <!-- S114: INDICATE BLURRING DISPLAY CANCELLATION -->
  <rect x="70" y="656" width="260" height="26" fill="white" stroke="black"/>
  <text x="200" y="669" text-anchor="middle">INDICATE BLURRING DISPLAY CANCELLATION</text>
  <text x="338" y="667" font-size="8">S114</text>
  <line x1="200" y1="682" x2="200" y2="699" stroke="black" marker-end="url(#a14)"/>
  <!-- S115 feeds in here too -->
  <line x1="392" y1="498" x2="392" y2="690" stroke="black"/>
  <line x1="392" y1="690" x2="330" y2="690" stroke="black" marker-end="url(#a14)"/>

  <!-- S116: FINISHED? -->
  <polygon points="200,699 280,718 200,737 120,718" fill="white" stroke="black"/>
  <text x="200" y="716" text-anchor="middle">FINISHED ?</text>
  <text x="290" y="716" font-size="8">S116</text>
  <!-- YES → END -->
  <line x1="200" y1="737" x2="200" y2="754" stroke="black" marker-end="url(#a14)"/>
  <text x="208" y="750" font-size="8">YES</text>
  <rect x="140" y="754" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="200" y="772" text-anchor="middle">END</text>
  <!-- NO → S117 -->
  <line x1="120" y1="718" x2="40" y2="718" stroke="black"/>
  <text x="58" y="714" font-size="8">NO</text>

  <!-- S117: MENU TO BE DISPLAYED? -->
  <polygon points="30,718 30,660 -10,680 -10,660" fill="none"/>
  <!-- simplified S117 -->
  <text x="15" y="668" font-size="7">S117</text>
  <line x1="40" y1="718" x2="40" y2="660" stroke="black"/>
  <polygon points="40,660 70,645 40,630 10,645" fill="white" stroke="black"/>
  <text x="40" y="643" text-anchor="middle" font-size="7">MENU TO</text>
  <text x="40" y="651" text-anchor="middle" font-size="7">DISPLAY?</text>
  <!-- YES → back to S101 -->
  <line x1="10" y1="645" x2="5" y2="645" stroke="black"/>
  <text x="7" y="638" font-size="7">YES</text>
  <line x1="5" y1="645" x2="5" y2="68" stroke="black"/>
  <line x1="5" y1="68" x2="70" y2="68" stroke="black" marker-end="url(#a14)"/>
  <!-- NO → back to S116 -->
  <line x1="40" y1="630" x2="40" y2="620" stroke="black"/>
  <line x1="40" y1="620" x2="120" y2="718" stroke="black" marker-end="url(#a14)"/>
</svg>

---

## FIG. 15 — Menu Displaying Means Flowchart

<svg viewBox="0 0 400 700" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a15" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- START -->
  <rect x="130" y="8" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="190" y="26" text-anchor="middle">START</text>
  <line x1="190" y1="34" x2="190" y2="50" stroke="black" marker-end="url(#a15)"/>

  <!-- S201 -->
  <rect x="60" y="50" width="260" height="36" fill="white" stroke="black"/>
  <text x="190" y="64" text-anchor="middle">READ OBJECT DATA OF CUBE GROUP</text>
  <text x="190" y="76" text-anchor="middle">FROM OBJECT DATA FILE</text>
  <text x="328" y="62" font-size="8">S201</text>
  <line x1="190" y1="86" x2="190" y2="103" stroke="black" marker-end="url(#a15)"/>

  <!-- loop arrow back from S212-NO -->
  <line x1="60" y1="103" x2="30" y2="103" stroke="black"/>
  <text x="35" y="99" font-size="7">←</text>

  <!-- S202 -->
  <rect x="60" y="103" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="120" text-anchor="middle">READ COLORING INFORMATION OF CUBE</text>
  <text x="328" y="114" font-size="8">S202</text>
  <line x1="190" y1="129" x2="190" y2="146" stroke="black" marker-end="url(#a15)"/>

  <!-- S203 -->
  <rect x="60" y="146" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="163" text-anchor="middle">REWRITE VERTEX DATA OF CUBE</text>
  <text x="328" y="157" font-size="8">S203</text>
  <line x1="190" y1="172" x2="190" y2="189" stroke="black" marker-end="url(#a15)"/>

  <!-- S204 -->
  <rect x="60" y="189" width="260" height="36" fill="white" stroke="black"/>
  <text x="190" y="203" text-anchor="middle">READ MOTION INFO FOR CUBE TO BE</text>
  <text x="190" y="215" text-anchor="middle">ROTATED ABOUT ITS OWN AXIS</text>
  <text x="328" y="201" font-size="8">S204</text>
  <line x1="190" y1="225" x2="190" y2="242" stroke="black" marker-end="url(#a15)"/>

  <!-- S205: IS PRESENT ITEM DIFFERENT? -->
  <polygon points="190,242 280,264 190,286 100,264" fill="white" stroke="black"/>
  <text x="190" y="259" text-anchor="middle">PRESENT ITEM</text>
  <text x="190" y="271" text-anchor="middle">DIFFERENT?</text>
  <text x="288" y="262" font-size="8">S205</text>
  <!-- YES → S206 -->
  <line x1="190" y1="286" x2="190" y2="303" stroke="black" marker-end="url(#a15)"/>
  <text x="198" y="299" font-size="8">YES</text>
  <!-- NO → skip to S207 -->
  <line x1="280" y1="264" x2="350" y2="264" stroke="black"/>
  <text x="298" y="260" font-size="8">NO</text>
  <line x1="350" y1="264" x2="350" y2="348" stroke="black"/>
  <line x1="350" y1="348" x2="320" y2="348" stroke="black" marker-end="url(#a15)"/>

  <!-- S206 -->
  <rect x="60" y="303" width="260" height="36" fill="white" stroke="black"/>
  <text x="190" y="317" text-anchor="middle">READ MOTION INFO TO IMPART</text>
  <text x="190" y="329" text-anchor="middle">SPECIAL MOTION TO SELECTED CUBE</text>
  <text x="328" y="315" font-size="8">S206</text>
  <line x1="190" y1="339" x2="190" y2="356" stroke="black" marker-end="url(#a15)"/>

  <!-- S207 -->
  <rect x="60" y="356" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="369" text-anchor="middle">REWRITE VERTEX DATA OF CUBES</text>
  <text x="190" y="381" text-anchor="middle"> BASED ON MOTION INFORMATION</text>
  <text x="328" y="367" font-size="8">S207</text>
  <line x1="190" y1="382" x2="190" y2="399" stroke="black" marker-end="url(#a15)"/>

  <!-- S208 -->
  <rect x="60" y="399" width="260" height="36" fill="white" stroke="black"/>
  <text x="190" y="413" text-anchor="middle">RENDER ALL CUBES (REFRACTING,</text>
  <text x="190" y="425" text-anchor="middle">BUMP MAPPING), STORE IN IMAGE MEM</text>
  <text x="328" y="411" font-size="8">S208</text>
  <line x1="190" y1="435" x2="190" y2="452" stroke="black" marker-end="url(#a15)"/>

  <!-- S209 -->
  <rect x="60" y="452" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="469" text-anchor="middle">READ PRESENTLY SELECTED ITEM CONTENTS</text>
  <text x="328" y="463" font-size="8">S209</text>
  <line x1="190" y1="478" x2="190" y2="495" stroke="black" marker-end="url(#a15)"/>

  <!-- S210 -->
  <rect x="60" y="495" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="512" text-anchor="middle">STORE ITEM CONTENTS IN IMAGE MEMORY</text>
  <text x="328" y="506" font-size="8">S210</text>
  <line x1="190" y1="521" x2="190" y2="538" stroke="black" marker-end="url(#a15)"/>

  <!-- S211 -->
  <rect x="60" y="538" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="555" text-anchor="middle">DISPLAY CUBE GROUP AND ITEM CONTENTS</text>
  <text x="328" y="549" font-size="8">S211</text>
  <line x1="190" y1="564" x2="190" y2="581" stroke="black" marker-end="url(#a15)"/>

  <!-- S212: FINISHED? -->
  <polygon points="190,581 270,600 190,619 110,600" fill="white" stroke="black"/>
  <text x="190" y="598" text-anchor="middle">FINISHED ?</text>
  <text x="278" y="598" font-size="8">S212</text>
  <!-- NO → back to S202 -->
  <line x1="110" y1="600" x2="30" y2="600" stroke="black"/>
  <text x="48" y="596" font-size="8">NO</text>
  <line x1="30" y1="600" x2="30" y2="103" stroke="black"/>
  <line x1="30" y1="103" x2="60" y2="103" stroke="black" marker-end="url(#a15)"/>
  <!-- YES -->
  <line x1="190" y1="619" x2="190" y2="636" stroke="black" marker-end="url(#a15)"/>
  <text x="198" y="632" font-size="8">YES</text>

  <!-- S213: ERASE MENU IMAGE -->
  <rect x="60" y="636" width="260" height="26" fill="white" stroke="black"/>
  <text x="190" y="653" text-anchor="middle">ERASE MENU IMAGE</text>
  <text x="328" y="647" font-size="8">S213</text>
  <line x1="190" y1="662" x2="190" y2="679" stroke="black" marker-end="url(#a15)"/>

  <!-- END -->
  <rect x="130" y="679" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="190" y="697" text-anchor="middle">END</text>
</svg>

---

## FIG. 16 — Measured Quantity Displaying Means Flowchart (Part 1, Steps S301–S309)

<svg viewBox="0 0 380 640" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a16" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- START -->
  <rect x="120" y="8" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="180" y="26" text-anchor="middle">START</text>
  <line x1="180" y1="34" x2="180" y2="50" stroke="black" marker-end="url(#a16)"/>

  <!-- S301 -->
  <rect x="50" y="50" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="64" text-anchor="middle">READ OBJECT DATA OF BLOCK GROUPS</text>
  <text x="180" y="76" text-anchor="middle">FROM OBJECT DATA FILE</text>
  <text x="316" y="62" font-size="8">S301</text>
  <line x1="180" y1="86" x2="180" y2="103" stroke="black" marker-end="url(#a16)"/>

  <!-- Connector (12) from FIG.17 -->
  <circle cx="35" cy="120" r="14" fill="white" stroke="black"/>
  <text x="35" y="125" text-anchor="middle" font-weight="bold">12</text>
  <line x1="49" y1="120" x2="180" y2="120" stroke="black"/>

  <!-- S302 -->
  <rect x="50" y="108" width="260" height="26" fill="white" stroke="black"/>
  <text x="180" y="125" text-anchor="middle">READ CLOCK INFORMATION</text>
  <text x="316" y="119" font-size="8">S302</text>
  <line x1="180" y1="134" x2="180" y2="151" stroke="black" marker-end="url(#a16)"/>

  <!-- S303 -->
  <rect x="50" y="151" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="165" text-anchor="middle">DETERMINE BLOCK TO BE COLORED</text>
  <text x="180" y="177" text-anchor="middle">BASED ON HOUR DATA</text>
  <text x="316" y="163" font-size="8">S303</text>
  <line x1="180" y1="187" x2="180" y2="204" stroke="black" marker-end="url(#a16)"/>

  <!-- S304 -->
  <rect x="50" y="204" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="218" text-anchor="middle">DETERMINE AMOUNT OF COLORING</text>
  <text x="180" y="230" text-anchor="middle">BASED ON MINUTE DATA, SECOND DATA</text>
  <text x="316" y="216" font-size="8">S304</text>
  <line x1="180" y1="240" x2="180" y2="257" stroke="black" marker-end="url(#a16)"/>

  <!-- S305 -->
  <rect x="50" y="257" width="260" height="46" fill="white" stroke="black"/>
  <text x="180" y="271" text-anchor="middle">REWRITE VERTEX DATA IN RANGE</text>
  <text x="180" y="283" text-anchor="middle">DEPENDING ON AMOUNT OF COLORING,</text>
  <text x="180" y="295" text-anchor="middle">OF VERTEX DATA OF BLOCK TO BE COLORED</text>
  <text x="316" y="269" font-size="8">S305</text>
  <line x1="180" y1="303" x2="180" y2="320" stroke="black" marker-end="url(#a16)"/>

  <!-- S306 -->
  <rect x="50" y="320" width="260" height="46" fill="white" stroke="black"/>
  <text x="180" y="334" text-anchor="middle">DETERMINE ANGULAR DISPLACEMENT</text>
  <text x="180" y="346" text-anchor="middle">ABOUT LONGITUDINAL AXIS OF BLOCK</text>
  <text x="180" y="358" text-anchor="middle">TO BE COLORED BASED ON CLOCK INFO</text>
  <text x="316" y="332" font-size="8">S306</text>
  <line x1="180" y1="366" x2="180" y2="383" stroke="black" marker-end="url(#a16)"/>

  <!-- S307 -->
  <rect x="50" y="383" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="397" text-anchor="middle">DETERMINE ANGULAR DISPLACEMENT</text>
  <text x="180" y="409" text-anchor="middle">FOR BLOCK ROTATED ABOUT ITS OWN AXIS</text>
  <text x="316" y="395" font-size="8">S307</text>
  <line x1="180" y1="419" x2="180" y2="436" stroke="black" marker-end="url(#a16)"/>

  <!-- S308 -->
  <rect x="50" y="436" width="260" height="56" fill="white" stroke="black"/>
  <text x="180" y="450" text-anchor="middle">REWRITE VERTEX DATA OF ALL BLOCKS</text>
  <text x="180" y="462" text-anchor="middle">BASED ON ANGULAR DISPLACEMENT OF</text>
  <text x="180" y="474" text-anchor="middle">BLOCK GROUP AND ANGULAR DISPLACEMENT</text>
  <text x="180" y="486" text-anchor="middle">FOR BLOCK ROTATED ABOUT ITS OWN AXIS</text>
  <text x="316" y="448" font-size="8">S308</text>
  <line x1="180" y1="492" x2="180" y2="509" stroke="black" marker-end="url(#a16)"/>

  <!-- S309 -->
  <rect x="50" y="509" width="260" height="46" fill="white" stroke="black"/>
  <text x="180" y="523" text-anchor="middle">RENDER ALL BLOCKS (REFRACTING,</text>
  <text x="180" y="535" text-anchor="middle">BUMP MAPPING), AND STORE IMAGE DATA</text>
  <text x="180" y="547" text-anchor="middle">IN IMAGE MEMORY</text>
  <text x="316" y="521" font-size="8">S309</text>
  <line x1="180" y1="555" x2="180" y2="572" stroke="black" marker-end="url(#a16)"/>

  <!-- Connector (11) to FIG.17 -->
  <circle cx="180" cy="586" r="14" fill="white" stroke="black"/>
  <text x="180" y="591" text-anchor="middle" font-weight="bold">11</text>
</svg>

---

## FIG. 17 — Measured Quantity Displaying Means Flowchart (Part 2, Steps S310–S316)

<svg viewBox="0 0 380 560" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="9">
  <defs>
    <marker id="a17" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0,7 2.5,0 5" fill="black"/>
    </marker>
  </defs>

  <!-- Connector (11) from FIG.16 -->
  <circle cx="180" cy="18" r="14" fill="white" stroke="black"/>
  <text x="180" y="23" text-anchor="middle" font-weight="bold">11</text>
  <line x1="180" y1="32" x2="180" y2="49" stroke="black" marker-end="url(#a17)"/>

  <!-- S310 -->
  <rect x="50" y="49" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="63" text-anchor="middle">READ MOTION INFO OF EACH LIGHT SPOT</text>
  <text x="180" y="75" text-anchor="middle">FROM MOTION INFORMATION TABLE</text>
  <text x="316" y="61" font-size="8">S310</text>
  <line x1="180" y1="85" x2="180" y2="102" stroke="black" marker-end="url(#a17)"/>

  <!-- S311 -->
  <rect x="50" y="102" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="116" text-anchor="middle">REWRITE VERTEX DATA BASED ON</text>
  <text x="180" y="128" text-anchor="middle">MOTION INFO OF EACH LIGHT SPOT</text>
  <text x="316" y="114" font-size="8">S311</text>
  <line x1="180" y1="138" x2="180" y2="155" stroke="black" marker-end="url(#a17)"/>

  <!-- S312 -->
  <rect x="50" y="155" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="169" text-anchor="middle">RENDER ALL LIGHT SPOTS ACCORDING TO</text>
  <text x="180" y="181" text-anchor="middle">AFTER-IMAGE PROCESSING, STORE IN MEM</text>
  <text x="316" y="167" font-size="8">S312</text>
  <line x1="180" y1="191" x2="180" y2="208" stroke="black" marker-end="url(#a17)"/>

  <!-- S313: BLURRED DISPLAY? -->
  <polygon points="180,208 270,227 180,246 90,227" fill="white" stroke="black"/>
  <text x="180" y="225" text-anchor="middle">BLURRED DISPLAY ?</text>
  <text x="278" y="225" font-size="8">S313</text>
  <!-- YES → S314 -->
  <line x1="180" y1="246" x2="180" y2="263" stroke="black" marker-end="url(#a17)"/>
  <text x="188" y="259" font-size="8">YES</text>
  <!-- NO → S315 -->
  <line x1="270" y1="227" x2="340" y2="227" stroke="black"/>
  <text x="288" y="223" font-size="8">NO</text>
  <line x1="340" y1="227" x2="340" y2="324" stroke="black"/>
  <line x1="340" y1="324" x2="310" y2="324" stroke="black" marker-end="url(#a17)"/>

  <!-- S314 -->
  <rect x="50" y="263" width="260" height="36" fill="white" stroke="black"/>
  <text x="180" y="277" text-anchor="middle">BLUR IMAGE DATA OF BLOCK GROUP</text>
  <text x="180" y="289" text-anchor="middle">AND LIGHT SPOT GROUP</text>
  <text x="316" y="275" font-size="8">S314</text>
  <line x1="180" y1="299" x2="180" y2="316" stroke="black" marker-end="url(#a17)"/>

  <!-- S315 -->
  <rect x="50" y="316" width="260" height="26" fill="white" stroke="black"/>
  <text x="180" y="333" text-anchor="middle">DISPLAY IMAGE DATA STORED IN IMAGE MEMORY</text>
  <text x="316" y="327" font-size="8">S315</text>
  <line x1="180" y1="342" x2="180" y2="359" stroke="black" marker-end="url(#a17)"/>

  <!-- S316: FINISHED? -->
  <polygon points="180,359 260,378 180,397 100,378" fill="white" stroke="black"/>
  <text x="180" y="376" text-anchor="middle">FINISHED ?</text>
  <text x="268" y="376" font-size="8">S316</text>
  <!-- YES → END -->
  <line x1="180" y1="397" x2="180" y2="414" stroke="black" marker-end="url(#a17)"/>
  <text x="188" y="410" font-size="8">YES</text>
  <rect x="120" y="414" width="120" height="26" rx="13" fill="white" stroke="black"/>
  <text x="180" y="432" text-anchor="middle">END</text>
  <!-- NO → Connector (12) back to FIG.16 -->
  <line x1="100" y1="378" x2="35" y2="378" stroke="black"/>
  <text x="53" y="374" font-size="8">NO</text>
  <circle cx="35" cy="422" r="14" fill="white" stroke="black"/>
  <text x="35" y="427" text-anchor="middle" font-weight="bold">12</text>
  <line x1="35" y1="378" x2="35" y2="408" stroke="black" marker-end="url(#a17)"/>
</svg>