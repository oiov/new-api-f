curl 'https://ecomagent.in/api/auth/signup' \
  --compressed \
  -X POST \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:149.0) Gecko/20100101 Firefox/149.0' \
  -H 'Accept: */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9,zh-TW;q=0.8,zh-HK;q=0.7,en-US;q=0.6,en;q=0.5' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  -H 'Referer: https://ecomagent.in/signup' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ecomagent.in' \
  -H 'Connection: keep-alive' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Sec-GPC: 1' \
  -H 'Priority: u=0' \
  -H 'TE: trailers' \
  --data-raw '{"email":"ja.hag.a.f.a.l.ak.a.j.a.h.a@gmail.com","password":"ja.hag.a.f.a.l.ak.a.j.a.h.a@gmail.com"}'


{"success":true,"requiresEmailConfirmation":true}
