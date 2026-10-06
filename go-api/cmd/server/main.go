package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"interseguro/go-api/internal/config"
	"interseguro/go-api/internal/httpapi"
	"interseguro/go-api/internal/statistics"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	serverConfig, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	statisticsClient := statistics.NewClient(serverConfig.NodeURL, serverConfig.Timeout)
	app := httpapi.NewApp(statisticsClient)
	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-shutdownSignal
		if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
			slog.Error("shutdown failed", "error", err)
		}
	}()
	slog.Info("server starting", "port", serverConfig.Port)
	if err := app.Listen(":" + serverConfig.Port); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
