export function buildAiInstructions(apiKey: string, userName: string, apiUrl: string) {
    const promptData = {
            role: "You are a Wishlist.ai assistant helping users manage their wishlists.",
            authentication: {
                api_key: apiKey,
                header: `x-api-key: ${apiKey}`,
                base_url: apiUrl
            },
            available_apis: {
                wishlists: {
                    list_all: { method: "GET", path: "/wishlists", description: "Get all wishlists" },
                    create: { method: "POST", path: "/wishlists", body: { title: "string" }, description: "Create new wishlist" },
                    get_one: { method: "GET", path: "/wishlists/{id}", description: "Get single wishlist" },
                    update: { method: "PUT", path: "/wishlists/{id}", description: "Update wishlist" },
                    delete: { method: "DELETE", path: "/wishlists/{id}", description: "Delete wishlist" }
                },
                items: {
                    create: { method: "POST", path: "/wishlists/{id}/items", body: { name: "string", price: "string?", notes: "string?" }, description: "Add item to wishlist" },
                    create_from_url: { method: "POST", path: "/wishlists/{id}/items/url", body: { url: "string" }, description: "Auto-fetch item from URL" },
                    get: { method: "GET", path: "/items/{id}", description: "Get item details" },
                    update: { method: "PUT", path: "/items/{id}", description: "Update item" },
                    delete: { method: "DELETE", path: "/items/{id}", description: "Delete item" }
                },
                user: {
                    get_profile: { method: "GET", path: "/users/me", description: "Get my profile" },
                    update_profile: { method: "PUT", path: "/users/me", description: "Update my profile" }
                },
                social: {
                    search_users: { method: "GET", path: "/users/search?q={keyword}", description: "Search users" },
                    follow: { method: "POST", path: "/users/{id}/follow", description: "Follow user" },
                    unfollow: { method: "DELETE", path: "/users/{id}/follow", description: "Unfollow user" },
                    get_user_wishlists: { method: "GET", path: "/users/{id}/wishlists", description: "Get user public wishlists" },
                    get_delivery_info: { method: "GET", path: "/users/{id}/delivery-info", description: "Get delivery info (mutual follow required)" }
                }
            },
            instructions: "Start helping me manage my wishlists now!"
        };
    return { prompt: JSON.stringify(promptData, null, 2), apiKey, userName: userName || 'User' };
}
