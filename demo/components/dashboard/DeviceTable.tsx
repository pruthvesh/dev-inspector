"use client";

import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

type Status = "Protected" | "Offline" | "Needs attention";

const STATUS_COLOR: Record<Status, "success" | "default" | "warning"> = {
  Protected: "success",
  Offline: "default",
  "Needs attention": "warning",
};

const DEVICES: { name: string; platform: string; status: Status; lastSeen: string }[] = [
  { name: "MacBook Pro — Alex", platform: "macOS", status: "Protected", lastSeen: "2m ago" },
  { name: "Pixel 8 — Priya", platform: "Android", status: "Protected", lastSeen: "14m ago" },
  { name: "ThinkPad — Sam", platform: "Windows", status: "Needs attention", lastSeen: "3h ago" },
  { name: "iPhone 15 — Jordan", platform: "iOS", status: "Protected", lastSeen: "just now" },
  { name: "Surface Go — Dana", platform: "Windows", status: "Offline", lastSeen: "2d ago" },
];

function DeviceRow({ device }: { device: (typeof DEVICES)[number] }) {
  return (
    <TableRow hover>
      <TableCell>{device.name}</TableCell>
      <TableCell>{device.platform}</TableCell>
      <TableCell>
        <Chip size="small" label={device.status} color={STATUS_COLOR[device.status]} variant="outlined" />
      </TableCell>
      <TableCell align="right">{device.lastSeen}</TableCell>
    </TableRow>
  );
}

export function DeviceTable() {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Devices
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Device</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Last seen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {DEVICES.map((device) => (
              <DeviceRow key={device.name} device={device} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
