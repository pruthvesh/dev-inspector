"use client";

import { useEffect, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { Sidebar } from "./Sidebar";

const DRAWER_WIDTH = 240;

/**
 * Mirrors a common real-world shape: a top-level `Stack` (a passthrough
 * MUI layout primitive, no host node of its own) holding `Header` as one
 * of several children, `Header` in turn rendering an `AppBar`/`Toolbar`
 * chain — the exact nesting pattern that exposed the owner-vs-render-tree
 * bug in production apps.
 */
function Header({ lastSync }: { lastSync: string | null }) {
  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          MDM Console
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 2, fontVariantNumeric: "tabular-nums" }}>
          Last sync: {lastSync ?? "…"}
        </Typography>
        <IconButton>
          <Badge badgeContent={2} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
        <Avatar sx={{ ml: 2, width: 32, height: 32 }}>N</Avatar>
      </Toolbar>
    </AppBar>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Ticks every second, re-rendering this whole subtree each time. Sidebar
  // is memoized, so it bails out on every one of these passes instead of
  // re-rendering — the same "some subtrees update, others don't" pattern
  // that live apps with polling/subscriptions produce constantly, and the
  // condition buildRenderChain has to stay correct through.
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLastSync(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Stack direction="row" sx={{ width: 1, minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Sidebar />
      </Drawer>
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Header lastSync={lastSync} />
        <Box component="main" sx={{ p: 3, flexGrow: 1 }}>
          {children}
        </Box>
      </Box>
    </Stack>
  );
}
