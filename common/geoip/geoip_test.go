package geoip

import "testing"

func TestSubnetOf(t *testing.T) {
	cases := []struct{ ip, want string }{
		{"8.8.8.8", "8.8.8.0/24"},
		{"114.114.114.114", "114.114.114.0/24"},
		{"192.168.1.55", "192.168.1.0/24"},
		{"2001:4860:4860::8888", "2001:4860:4860::/48"},
		{"", ""},
		{"not-an-ip", ""},
	}
	for _, c := range cases {
		if got := SubnetOf(c.ip); got != c.want {
			t.Errorf("SubnetOf(%q)=%q want %q", c.ip, got, c.want)
		}
	}
}

func TestLookupNilReaderDegrades(t *testing.T) {
	_, _, ok := Lookup("8.8.8.8")
	if ok {
		t.Fatal("expected ok=false when reader is nil")
	}
}
