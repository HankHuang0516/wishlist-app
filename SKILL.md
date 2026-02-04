# WishlistAI Agent Skill

> A wishlist management API that allows AI agents to help users create, manage, and share gift wishlists.

## Quick Start

**Base URL:** `https://wishlist-app-production.up.railway.app`

**Authentication:**
1. Login: `POST /api/auth/login` with `{ phoneNumber, password }`
2. Generate API Key: `POST /api/users/me/apikey` (Bearer token required)
3. Use API Key: Add `x-api-key: <your-key>` header to all requests

## Available Actions

### Wishlists
| Action | Endpoint | Description |
|--------|----------|-------------|
| List all | `GET /api/wishlists` | Get all user's wishlists |
| Create | `POST /api/wishlists` | Create new wishlist `{ title }` |
| Get one | `GET /api/wishlists/{id}` | Get wishlist with items |
| Delete | `DELETE /api/wishlists/{id}` | Delete a wishlist |

### Items
| Action | Endpoint | Description |
|--------|----------|-------------|
| Add by name | `POST /api/wishlists/{id}/items` | Add item `{ name, price?, notes? }` |
| Add by URL | `POST /api/wishlists/{id}/items/url` | Scrape product from URL `{ url }` |
| Update | `PUT /api/items/{id}` | Update item details |
| Delete | `DELETE /api/items/{id}` | Remove item |

## Example Workflow

```bash
# 1. Login and get token
curl -X POST https://wishlist-app-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"0912345678","password":"Password123"}'

# 2. Generate API Key (use token from step 1)
curl -X POST https://wishlist-app-production.up.railway.app/api/users/me/apikey \
  -H "Authorization: Bearer <token>"

# 3. Create a wishlist
curl -X POST https://wishlist-app-production.up.railway.app/api/wishlists \
  -H "x-api-key: <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Birthday Gifts"}'

# 4. Add an item from URL (auto-scrapes product info)
curl -X POST https://wishlist-app-production.up.railway.app/api/wishlists/1/items/url \
  -H "x-api-key: <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558"}'
```

## OpenAPI Specification

Full API documentation: [/api/swagger.json](https://wishlist-app-production.up.railway.app/api/swagger.json)

## Supported E-commerce Platforms

- Shopee (蝦皮)
- Momo (momo購物網)
- PChome
- And any URL with Open Graph metadata

## 🛠️ 開發與品質守則 (Mandatory)

**所有 AI 代理（包含 Claude CLI）在執行任何代碼修改或部署前，必須遵守以下守則：**

1. **查閱參考資料**：必須先讀取並理解 `/.agent/skills/` 與 `/.agent/workflows/` 中的所有檔案。
2. **品質保護網**：這些文件定義了產品的架構標準與品質檢查流程，任何變更不得與其衝突。
3. **穩定性優先**：嚴格執行 `workflows/` 定義的 Pre-work 與檢查步驟。

## Model Context Protocol (MCP) Integration

This application now supports MCP, allowing AI agents (like Claude) to access wishlist data directly as resources.

### Resources
- `wishlist://all`: Returns a JSON list of all public wishlists and their items.

### Tools
- `create_wishlist`: Creates a new wishlist. Parameters: `{ title, userId }`.
- `add_item`: Adds an item to a wishlist. Parameters: `{ wishlistId, name, price?, link?, notes? }`.

### Running the MCP Server
To use this with Claude Desktop or other MCP clients, configure it with the following command:
```bash
node /path/to/wishlist-app/server/dist/mcp/index.js
```
Note: Ensure you have built the project (`npm run build`) before running.
