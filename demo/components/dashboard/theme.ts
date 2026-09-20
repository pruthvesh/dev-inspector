import { createTheme } from "@mui/material/styles";

export const dashboardTheme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#09090b", paper: "#18181b" },
    primary: { main: "#7c3aed" },
    divider: "#27272a",
  },
  shape: { borderRadius: 10 },
});
