"use client";

import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

const ACTIVITY = [
  { actor: "admin@northwind.example", action: "policy.update — Baseline security", time: "2h ago" },
  { actor: "system", action: "enrolled Pixel 8 — Priya", time: "6h ago" },
  { actor: "admin@northwind.example", action: "group.create — Field sales", time: "1d ago" },
];

function ActivityRow({ entry }: { entry: (typeof ACTIVITY)[number] }) {
  return (
    <ListItem alignItems="flex-start">
      <ListItemAvatar>
        <Avatar sx={{ width: 32, height: 32 }}>{entry.actor[0].toUpperCase()}</Avatar>
      </ListItemAvatar>
      <ListItemText primary={entry.action} secondary={`${entry.actor} · ${entry.time}`} />
    </ListItem>
  );
}

export function ActivityFeed() {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Recent activity
      </Typography>
      <List dense disablePadding>
        {ACTIVITY.map((entry, i) => (
          <ActivityRow key={i} entry={entry} />
        ))}
      </List>
    </Paper>
  );
}
