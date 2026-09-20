"use client";

import { memo } from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DevicesIcon from "@mui/icons-material/Devices";
import GroupsIcon from "@mui/icons-material/Groups";

interface NavEntry {
  label: string;
  icon: SvgIconComponent;
  active?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavEntry[] }[] = [
  { label: "Overview", items: [{ label: "Dashboard", icon: DashboardIcon, active: true }] },
  {
    label: "Devices",
    items: [
      { label: "All devices", icon: DevicesIcon },
      { label: "Groups", icon: GroupsIcon },
    ],
  },
];

// Intentionally a passthrough — this is the same shape as MUI's own layout
// primitives (Stack, Grid, Box): it renders `{children}` without adding a
// DOM node of its own, so it only shows up in the Tree if nesting is built
// from the real fiber tree rather than JSX ownership.
function NavSection({ children }: { children: React.ReactNode }) {
  return <Box sx={{ mb: 1 }}>{children}</Box>;
}

function NavItem({ label, icon: Icon, active }: NavEntry) {
  return (
    <ListItemButton selected={active}>
      <ListItemIcon>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText primary={label} />
    </ListItemButton>
  );
}

// Memoized on purpose: DashboardLayout re-renders every second (see its
// ticking "Last sync" clock), and Sidebar bailing out on each of those
// passes is what exercises the stale-fiber edge case buildRenderChain has
// to resolve through (see fiber.ts's currentFiber calls).
export const Sidebar = memo(function Sidebar() {
  return (
    <Box sx={{ width: 240 }}>
      {NAV_SECTIONS.map((section) => (
        <NavSection key={section.label}>
          <Typography
            variant="overline"
            sx={{ pl: 2, color: "text.secondary", display: "block" }}
          >
            {section.label}
          </Typography>
          <List dense>
            {section.items.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </List>
        </NavSection>
      ))}
    </Box>
  );
});
