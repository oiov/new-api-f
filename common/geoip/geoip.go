package geoip

import (
	"net"
	"sync"

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
