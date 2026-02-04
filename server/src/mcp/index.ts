import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import prisma from "../lib/prisma";

/**
 * Wishlist MCP Server
 * Exposes wishlist data as resources for AI agents.
 */
const server = new Server(
  {
    name: "wishlist-app-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
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
