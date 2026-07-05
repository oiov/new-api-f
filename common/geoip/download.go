package geoip

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func currentYearMonth() string { return time.Now().Format("2006-01") }

func previousYearMonth() string {
	now := time.Now()
	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	return first.AddDate(0, -1, 0).Format("2006-01")
}

func versionPath(dbPath string) string { return dbPath + ".version" }

// isStale：sidecar 缺失，或年月既不等于当前月也不等于上月 → 过期。
// 允许上月库是为了避免月初 DB-IP 尚未发布当月库时反复触发下载。
func isStale(dbPath string) bool {
	b, err := os.ReadFile(versionPath(dbPath))
	if err != nil {
		return true
	}
	ym := strings.TrimSpace(string(b))
	return ym != currentYearMonth() && ym != previousYearMonth()
}

// downloadCurrentMonth：先拉当月库；DB-IP 月初可能尚未发布当月库（404），
// 失败则回退拉上月库一次。sidecar 写入实际成功的年月。
func downloadCurrentMonth(dbPath string) error {
	cur := currentYearMonth()
	if err := downloadMonth(cur, dbPath); err == nil {
		return os.WriteFile(versionPath(dbPath), []byte(cur), 0o644)
	} else {
		prev := previousYearMonth()
		if err2 := downloadMonth(prev, dbPath); err2 != nil {
			return fmt.Errorf("current(%s): %v; previous(%s): %v", cur, err, prev, err2)
		}
		return os.WriteFile(versionPath(dbPath), []byte(prev), 0o644)
	}
}

// downloadMonth：拉指定 YYYY-MM 的 DB-IP gz → gunzip → 原子写 dbPath。
func downloadMonth(ym string, dbPath string) error {
	url := fmt.Sprintf("https://download.db-ip.com/free/dbip-city-lite-%s.mmdb.gz", ym)
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url) //nolint
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("db-ip status %d", resp.StatusCode)
	}
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gz.Close()

	tmp := dbPath + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	// 兜底：任何失败路径都清理 tmp；成功 rename 后是无害 no-op。
	defer os.Remove(tmp)
	if _, err := io.Copy(f, gz); err != nil { //nolint:gosec
		f.Close()
		return err
	}
	// 原子写关键：缓冲写错误（如 ENOSPC）在 Close 时才暴露，必须在 rename 前检查，
	// 否则截断/损坏的 mmdb 可能被 rename 就位并写下 sidecar，下次启动误判为新鲜有效。
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dbPath)
}
