//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// Die exe hat kein Konsolenfenster; Meldungen erscheinen als Windows-Dialog.
func showDialog(title, msg string, isError bool) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(msg)
	flags := uintptr(0x40) // MB_ICONINFORMATION
	if isError {
		flags = 0x10 // MB_ICONERROR
	}
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags)
}
