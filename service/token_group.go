package service

import (
	"errors"
	"strings"
)

func NormalizeTokenGroups(group string) ([]string, error) {
	seen := make(map[string]struct{})
	groups := make([]string, 0)

	for _, part := range strings.Split(group, ",") {
		groupName := strings.TrimSpace(part)
		if groupName == "" {
			continue
		}
		if _, ok := seen[groupName]; ok {
			continue
		}
		seen[groupName] = struct{}{}
		groups = append(groups, groupName)
	}

	if len(groups) > 1 {
		for _, groupName := range groups {
			if groupName == "auto" {
				return nil, errors.New("auto 分组不能和其他分组同时选择")
			}
		}
	}

	return groups, nil
}

func JoinTokenGroups(groups []string) string {
	return strings.Join(groups, ",")
}

func FirstTokenGroup(group string) string {
	groups, err := NormalizeTokenGroups(group)
	if err != nil || len(groups) == 0 {
		return ""
	}
	return groups[0]
}

func TokenGroupContains(group string, target string) bool {
	target = strings.TrimSpace(target)
	if target == "" {
		return false
	}
	groups, err := NormalizeTokenGroups(group)
	if err != nil {
		return false
	}
	for _, groupName := range groups {
		if groupName == target {
			return true
		}
	}
	return false
}
