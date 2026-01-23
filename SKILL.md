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
