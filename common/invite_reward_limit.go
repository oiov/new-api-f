package common

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type inviteRewardLimitEntry struct {
	Count     int
	ExpiredAt int64
}

type inviteRewardMemoryLimiter struct {
	mutex sync.Mutex
	store map[string]inviteRewardLimitEntry
}

var inviteRewardLimiter = &inviteRewardMemoryLimiter{
	store: make(map[string]inviteRewardLimitEntry),
}

func (l *inviteRewardMemoryLimiter) allow(keys []string, limits []int, now int64, ttlSeconds int64) bool {
	if len(keys) == 0 || len(keys) != len(limits) {
		return true
	}
	l.mutex.Lock()
	defer l.mutex.Unlock()

	for index, key := range keys {
		limit := limits[index]
		if limit <= 0 {
			continue
		}
		entry, ok := l.store[key]
		if ok && entry.ExpiredAt <= now {
			delete(l.store, key)
			ok = false
		}
		if ok && entry.Count >= limit {
			return false
		}
	}

	expiredAt := now + ttlSeconds
	for index, key := range keys {
		if limits[index] <= 0 {
			continue
		}
		entry, ok := l.store[key]
		if !ok || entry.ExpiredAt <= now {
			entry = inviteRewardLimitEntry{
				Count:     0,
				ExpiredAt: expiredAt,
			}
		}
		entry.Count++
		l.store[key] = entry
	}
	return true
}

func checkInviteRewardLimits(keys []string, limits []int, now int64, ttlSeconds int64) (bool, error) {
	filteredKeys := make([]string, 0, len(keys))
	filteredLimits := make([]int, 0, len(limits))
	for index, key := range keys {
		if key == "" || index >= len(limits) || limits[index] <= 0 {
			continue
		}
		filteredKeys = append(filteredKeys, key)
		filteredLimits = append(filteredLimits, limits[index])
	}
	if len(filteredKeys) == 0 {
		return true, nil
	}
	if RedisEnabled && RDB != nil {
		script := `
for i = 1, #KEYS do
	local current = redis.call("GET", KEYS[i])
	if current and tonumber(current) >= tonumber(ARGV[i]) then
		return 0
	end
end
local ttl = tonumber(ARGV[#ARGV])
for i = 1, #KEYS do
	local nextValue = redis.call("INCR", KEYS[i])
	if nextValue == 1 then
		redis.call("EXPIRE", KEYS[i], ttl)
	end
end
return 1
`
		args := make([]any, 0, len(filteredLimits)+1)
		for _, limit := range filteredLimits {
			args = append(args, limit)
		}
		args = append(args, ttlSeconds)
		allowed, err := RDB.Eval(context.Background(), script, filteredKeys, args...).Int()
		if err != nil {
			SysError(fmt.Sprintf("invite reward redis limiter failed, fallback to memory limiter: err=%v", err))
			return inviteRewardLimiter.allow(filteredKeys, filteredLimits, now, ttlSeconds), nil
		}
		return allowed == 1, nil
	}
	return inviteRewardLimiter.allow(filteredKeys, filteredLimits, now, ttlSeconds), nil
}

func CheckInviteRewardEligibility(inviterId int, clientIP string) (bool, string) {
	if inviterId <= 0 {
		return true, ""
	}
	windowMinutes := InviteRewardLimitWindowMinutes
	if windowMinutes <= 0 {
		return true, ""
	}
	normalizedIP := strings.TrimSpace(clientIP)
	now := time.Now().Unix()
	ttlSeconds := int64(windowMinutes) * 60
	windowTag := fmt.Sprintf("w:%d", windowMinutes)
	keys := make([]string, 0, 3)
	limits := make([]int, 0, 3)

	inviterKey := fmt.Sprintf("inviteReward:%s:inviter:%d", windowTag, inviterId)
	if InviteRewardMaxCountPerInviter > 0 {
		keys = append(keys, inviterKey)
		limits = append(limits, InviteRewardMaxCountPerInviter)
	}
	if normalizedIP == "" {
		allowed, err := checkInviteRewardLimits(keys, limits, now, ttlSeconds)
		if err != nil {
			SysError(fmt.Sprintf("check invite reward limit failed: inviter=%d err=%v", inviterId, err))
			return false, "invite_reward_check_failed"
		}
		if !allowed {
			return false, "invite_reward_limit"
		}
		return true, ""
	}

	if InviteRewardMaxCountPerIP > 0 {
		keys = append(keys, fmt.Sprintf("inviteReward:%s:ip:%s", windowTag, normalizedIP))
		limits = append(limits, InviteRewardMaxCountPerIP)
	}
	if InviteRewardMaxCountPerInviterIP > 0 {
		keys = append(keys, fmt.Sprintf("inviteReward:%s:inviter:%d:ip:%s", windowTag, inviterId, normalizedIP))
		limits = append(limits, InviteRewardMaxCountPerInviterIP)
	}
	allowed, err := checkInviteRewardLimits(keys, limits, now, ttlSeconds)
	if err != nil {
		SysError(fmt.Sprintf("check invite reward limit failed: inviter=%d ip=%s err=%v", inviterId, normalizedIP, err))
		return false, "invite_reward_check_failed"
	}
	if !allowed {
		return false, "invite_reward_limit"
	}
	return true, ""
}
