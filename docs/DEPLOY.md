# Publicação

O resultado de `npm run build` é a pasta `dist/` (HTML, JS e CSS estáticos). Sirva-a por HTTPS em um servidor estático interno.

> Abrir `dist/index.html` direto por `file://` **não funciona** (módulos ES são bloqueados). Use um servidor estático.

## Cabeçalhos recomendados

A CSP já vai dentro do `index.html`. Estes cabeçalhos **não** podem ser definidos por `<meta>`, então configure-os no servidor:

```
Content-Security-Policy: <mesma política do index.html>; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), payment=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
Cache-Control: no-store            # para index.html
```

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name hub.interno.exemplo;
  root /var/www/hub-dados/dist;

  add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Cross-Origin-Opener-Policy same-origin always;
  add_header Cross-Origin-Resource-Policy same-origin always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=(), serial=(), payment=()" always;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  location = /index.html { add_header Cache-Control "no-store" always; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; }
}
```

### IIS (`web.config`, bloco `customHeaders`)

Adicione os mesmos pares nome/valor em `<system.webServer><httpProtocol><customHeaders>`.

## Embutindo em outro sistema

- Mantenha a CSP restritiva na página hospedeira (ou, no mínimo, `connect-src` sem o domínio de terceiros para essa tela).
- Se o sistema hospedeiro precisa de rede, hospede o Hub em **página/rota própria** sem scripts de terceiros, em vez de misturá-lo com a aplicação principal.
- Use `hub.destroy()` ao sair da tela para apagar os dados da memória.

## Checklist de release

1. `npm ci && npm run audit && npm run typecheck && npm run test:coverage`
2. `npm run build`
3. Conferir que `dist/index.html` não tem `<script>` inline nem recursos externos (o teste de política já faz isso no fonte).
4. Publicar `dist/` e validar os cabeçalhos (por exemplo `curl -sI https://hub.interno.exemplo/`).
5. Abrir o app e conferir no console do navegador que não há violações de CSP.
