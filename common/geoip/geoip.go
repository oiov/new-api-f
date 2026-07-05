package geoip

import (
	"net"
	"os"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/oschwald/geoip2-golang"
)

var (
	mu     sync.RWMutex
	reader *geoip2.Reader
)

// SubnetOf 返回 IP 的归并子网前缀：IPv4 /24、IPv6 /48。非法/空 → ""。
func SubnetOf(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}
	if v4 := parsed.To4(); v4 != nil {
		mask := net.CIDRMask(24, 32)
		return (&net.IPNet{IP: v4.Mask(mask), Mask: mask}).String()
	}
	mask := net.CIDRMask(48, 128)
	return (&net.IPNet{IP: parsed.Mask(mask), Mask: mask}).String()
}

// Lookup 解析 IP 的国家/城市。reader 未就绪 / 非法 IP / 未命中 → ok=false，绝不 panic。
func Lookup(ip string) (country string, city string, ok bool) {
	mu.RLock()
	r := reader
	mu.RUnlock()
	if r == nil {
		return "", "", false
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "", "", false
	}
	rec, err := r.City(parsed)
	if err != nil || rec == nil {
		return "", "", false
	}
	return rec.Country.IsoCode, rec.City.Names["en"], true
}

// Init 读取配置，尝试载入本地 mmdb；缺失且允许自下载时后台异步拉取。非致命。
func Init() {
	path := common.GetEnvOrDefaultString("GEOIP_DB_PATH", "/data/geoip/dbip-city-lite.mmdb")
	autoDownload := common.GetEnvOrDefaultString("GEOIP_AUTO_DOWNLOAD", "true") == "true"

	if fileExists(path) && !isStale(path) {
		if err := load(path); err != nil {
			common.SysError("geoip: load failed: " + err.Error())
		} else {
			common.SysLog("geoip: loaded " + path)
		}
		return
	}
	if !autoDownload {
		common.SysLog("geoip: db missing/stale and auto-download disabled; geo degraded")
		return
	}
	go func() {
		if err := downloadCurrentMonth(path); err != nil {
			common.SysError("geoip: auto-download failed (geo degraded): " + err.Error())
			return
		}
		if err := load(path); err != nil {
			common.SysError("geoip: load after download failed: " + err.Error())
			return
		}
		common.SysLog("geoip: downloaded + loaded " + path)
	}()
}

func load(path string) error {
	r, err := geoip2.Open(path)
	if err != nil {
		return err
	}
	mu.Lock()
	old := reader
	reader = r
	mu.Unlock()
	// 关闭旧 reader 仅在当前调用模型下安全：Init() 启动时只跑一次，old 恒为 nil。
	// 若将来加入进程内月度热刷新，正持有旧 reader 的在途 Lookup 会在 Close() 后访问
	// 已解除映射的内存 → 必须先引入静默期/引用计数再 Close。
	if old != nil {
		_ = old.Close()
	}
	return nil
}

func Close() {
	mu.Lock()
	defer mu.Unlock()
	if reader != nil {
		_ = reader.Close()
		reader = nil
	}
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
