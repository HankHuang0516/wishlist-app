import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import prisma from "../lib/prisma";

/**
 * Wishlist MCP Server
 * Exposes wishlist data as resources and management tools for AI agents.
 */
const server = new Server(
  {
    name: "wishlist-app-mcp",
    version: "0.2.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * List available resources.
 * We expose 'wishlist://all' to provide a high-level view of all wishlists.
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "wishlist://all",
        name: "All Wishlists",
        mimeType: "application/json",
        description: "Returns a JSON list of all wishlists and their items in the system.",
      },
    ],
  };
});

/**
 * Read resource content.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "wishlist://all") {
    try {
      const wishlists = await prisma.wishlist.findMany({
        include: {
          items: {
            where: { isHidden: false },
          },
          user: {
            select: {
              name: true,
              nicknames: true,
            },
          },
        },
      });

      return {
        contents: [
          {
            uri: "wishlist://all",
            mimeType: "application/json",
            text: JSON.stringify(wishlists, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("MCP Error fetching wishlists:", error);
      return {
        contents: [
          {
            uri: "wishlist://all",
            mimeType: "application/json",
            text: JSON.stringify({ 
              error: "Database error", 
              message: error instanceof Error ? error.message : "Unknown error" 
            }),
          },
        ],
      };
    }
  }

  throw new Error(`Resource not found: ${request.params.uri}`);
});

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_wishlist",
        description: "Creates a new wishlist for a specific user.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "The title of the wishlist" },
            userId: { type: "number", description: "The ID of the user who owns the wishlist" },
          },
          required: ["title", "userId"],
        },
      },
      {
        name: "add_item",
        description: "Adds a new item to an existing wishlist.",
        inputSchema: {
          type: "object",
          properties: {
            wishlistId: { type: "number", description: "The ID of the wishlist to add the item to" },
            name: { type: "string", description: "The name of the item" },
            price: { type: "string", description: "The price of the item (optional)" },
            link: { type: "string", description: "A link to the item (optional)" },
            notes: { type: "string", description: "Additional notes for the item (optional)" },
          },
          required: ["wishlistId", "name"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = request.params.arguments;

  try {
    if (name === "create_wishlist") {
      const { title, userId } = args as { title: string; userId: number };
      const wishlist = await prisma.wishlist.create({
        data: {
          title,
          userId,
        },
      });
      return {
        content: [{ type: "text", text: `Successfully created wishlist: ${JSON.stringify(wishlist)}` }],
      };
    }

    if (name === "add_item") {
      const { wishlistId, name: itemName, price, link, notes } = args as {
        wishlistId: number;
        name: string;
        price?: string;
        link?: string;
        notes?: string;
      };

      const item = await prisma.item.create({
        data: {
          wishlistId,
          name: itemName,
          price: price || null,
          link: link || null,
          notes: notes || null,
        },
      });

      return {
        content: [{ type: "text", text: `Successfully added item: ${JSON.stringify(item)}` }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    console.error(`MCP Tool Error (${name}):`, error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});

/**
 * Start the server using Stdio transport.
 */
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Wishlist MCP Server started");
}

run().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});
