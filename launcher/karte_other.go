//go:build !linux && !windows

package main

func verstaendlich(err error) string { return "Kartenleser: " + err.Error() }
