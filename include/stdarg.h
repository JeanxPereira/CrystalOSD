#ifndef _STDARG_H
#define _STDARG_H

typedef void *__gnuc_va_list;
typedef __gnuc_va_list va_list;

#define va_start(v,l)   __builtin_stdarg_start((v),l)
#define va_end(v)       __builtin_va_end(v)
#define va_arg(v,l)     __builtin_va_arg(v,l)

#endif
