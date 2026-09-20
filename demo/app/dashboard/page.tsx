"use client";

import Link from "next/link";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import DevicesIcon from "@mui/icons-material/Devices";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ShieldIcon from "@mui/icons-material/Shield";
import BlockIcon from "@mui/icons-material/Block";
import type { SvgIconComponent } from "@mui/icons-material";
import { ActivityFeed } from "../../components/dashboard/ActivityFeed";
import { DashboardLayout } from "../../components/dashboard/DashboardLayout";
import { DeviceTable } from "../../components/dashboard/DeviceTable";
import { StatCard } from "../../components/dashboard/StatCard";
import { dashboardTheme } from "../../components/dashboard/theme";

const STATS: { label: string; value: string; hint: string; icon: SvgIconComponent }[] = [
  { label: "Total devices", value: "8", hint: "6 active", icon: DevicesIcon },
  { label: "Needs attention", value: "1", hint: "2 offline", icon: WarningAmberIcon },
  { label: "Protected devices", value: "5", hint: "web protection on", icon: ShieldIcon },
  { label: "Threats blocked", value: "24", hint: "last 7 days", icon: BlockIcon },
];

export default function DashboardPage() {
  return (
    <ThemeProvider theme={dashboardTheme}>
      <DashboardLayout>
        <Typography variant="body2" sx={{ mb: 2 }}>
          <Link href="/" style={{ color: "inherit" }}>
            ← back to the simple demo
          </Link>
        </Typography>
        <Box sx={{ mb: 3, color: "text.secondary", fontSize: 13, maxWidth: 640 }}>
          A deeper, MUI-based hierarchy for exercising the Tree view: layout
          primitives that only render <code>{"{children}"}</code> (
          <code>Stack</code>, <code>Grid</code>, <code>Box</code>), a
          memoized <code>Sidebar</code> that bails out every second while the
          header clock ticks, and several component layers per visible
          element (<code>Styled(ForwardRef(AppBar))</code> →{" "}
          <code>AppBar</code> → <code>MuiAppBarRoot</code>, etc). Open the
          panel&apos;s Tree tab and expand it — nesting should exactly match
          this page&apos;s and <code>DashboardLayout</code>&apos;s JSX, and
          toggling &quot;Only app components&quot; should collapse away the
          library-internal layers.
        </Box>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {STATS.map((stat) => (
            <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard {...stat} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <DeviceTable />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <ActivityFeed />
          </Grid>
        </Grid>
      </DashboardLayout>
    </ThemeProvider>
  );
}
