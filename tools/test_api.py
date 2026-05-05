import urllib.request, json
data = json.dumps({
    "compiler": "ee-gcc2.9-991111",
    "compiler_flags": "-O2 -G0",
    "source_code": "void test(){}",
    "target_asm": ".set noat\n.set noreorder\ntest:\njr $ra\nnop\n",
    "context": ""
}).encode()
req = urllib.request.Request("https://decomp.me/api/scratch", data=data, headers={"Content-Type": "application/json"})
resp = json.loads(urllib.request.urlopen(req).read())
print(json.dumps(resp, indent=2))
