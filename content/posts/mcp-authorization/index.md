---
title: "MCP authorization, one exchange at a time"
slug: "mcp-authorization"
date: 2026-10-15
draft: false
tags: ["mcp", "oauth"]
description: "An illustrated MCP authorization flow: discovery, browser sign-in, PKCE, token exchange, and authenticated requests."
# Homepage shows the summary only; trace.css loads on this page.
interactive: true
css: ["trace.css"]
# Publish only the minified, fingerprinted copies the templates reference.
build:
  publishResources: false
---

Follow Copilot as it discovers how to sign in, opens the browser, exchanges an authorization code with Microsoft Entra, and calls an MCP server with an access token.

<!--more-->

*Identifiers, credentials, and the tool definition are illustrative.*

## The participants

- **Copilot CLI**: the OAuth client. Creates PKCE values, receives the callback, and uses tokens.
- **Browser**: presents sign-in and carries redirects between Entra and Copilot.
- **Microsoft Entra**: the authorization server. Authenticates the user and issues codes and tokens.
- **MCP server**: the protected resource. Validates access tokens before serving MCP operations.

## The HTTP conversation {#flow}

Open an exchange to see its request and response. **Explain** annotates each field: what it is, why it is there, and the spec that defines it.

{{< mcp-trace >}}

## Renewing access later {#refresh}

The `offline_access` scope asks Entra to issue a refresh token in exchange 08. As the access token expires, Copilot can send that refresh token directly to the same Entra token endpoint, in a separate refresh grant:

```http
POST /aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/oauth2/v2.0/token HTTP/1.1
Host: login.microsoftonline.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=11111111-2222-4333-8444-555555555555
&refresh_token=EXAMPLE_MCP_REFRESH_TOKEN_NOT_VALID
&scope=https%3A%2F%2Fmcp.example.com%2FTrace.Read
```

`grant_type=refresh_token` replaces the authorization-code grant. There is no new authorization code, PKCE verifier, or browser callback in this request. Copilot is a public client, so it does not send a client secret. The optional `scope` requests already granted MCP permissions.

Entra returns a new access token, which Copilot uses in the next MCP request. If Entra also returns a new refresh token, Copilot replaces the stored one. **The refresh token goes to Entra, never to the MCP server.**

Renewal is not guaranteed forever: if the refresh token expires, is revoked, or policy requires interaction, Copilot must return to sign-in.

- [RFC 6749 §6](https://www.rfc-editor.org/rfc/rfc6749.html#section-6): obtaining new access tokens with a refresh-token grant.
- [MCP / refresh tokens](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#refresh-tokens): clients may request `offline_access` when the authorization server advertises it.
- [Entra / refresh grant](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token): the Entra token request used to renew access with a refresh token.
- [Entra / offline_access](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc#the-offline_access-scope): why Entra v2 clients explicitly request `offline_access` to receive refresh tokens.

## How PKCE works {#pkce}

PKCE (Proof Key for Code Exchange) is how Copilot proves it started the sign-in. The `code_verifier` and `code_challenge` are **values, not actors**: Copilot creates both, and Entra checks the relationship between them.

1. **Copilot creates a secret and its hash.** Copilot generates a fresh random `code_verifier`, keeps it locally, and computes `code_challenge` using SHA-256 and unpadded base64url.
2. **Copilot → Browser → Entra: challenge.** Copilot puts `code_challenge` and `code_challenge_method=S256` in the authorization URL. The browser sends them to Entra. The verifier stays with Copilot.
3. **Entra → Browser → Copilot: code.** After user authorization, Entra issues a short-lived code bound to that challenge and method. The browser delivers the code to Copilot's local callback.
4. **Copilot → Entra: code + verifier.** Copilot sends both directly to Entra's token endpoint over HTTPS. Entra hashes the verifier and compares it with the bound challenge. A mismatch is rejected; a match allows the remaining token checks to proceed.

The trace uses the example pair from RFC 7636 Appendix B:

```
code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))

code_verifier  = dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
code_challenge = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```

A stolen authorization code alone is not enough: the attacker also needs Copilot's verifier. **The MCP server does not check PKCE**: it receives and validates the access token Entra issues.

- [RFC 7636 §4.1](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.1): generating a fresh, high-entropy `code_verifier`.
- [RFC 7636 §4.2](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.2): deriving `code_challenge` from the verifier, including S256.
- [RFC 7636 §4.3](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.3): sending the challenge and method in the authorization request.
- [RFC 7636 §4.4](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.4): binding the issued code to the challenge and method.
- [RFC 7636 §4.5](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.5): sending `code_verifier` when redeeming the authorization code.
- [RFC 7636 §4.6](https://www.rfc-editor.org/rfc/rfc7636.html#section-4.6): the server checking the verifier before issuing tokens.
