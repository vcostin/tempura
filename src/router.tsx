import { createHashRouter, Navigate } from "react-router";
import {
  AboutRoute,
  DebugRoute,
  ReportRoute,
  SettingsRoute,
  ShortcutsRoute,
  StatsRoute,
  TechniqueEditorRoute,
  TechniquesRoute,
} from "./routes/panels";
import { TimerLayout } from "./routes/TimerLayout";

/**
 * Hash routes: the packaged app is served from Tauri's asset protocol, where
 * `/settings` has no file behind it but `#/settings` always loads index.html.
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <TimerLayout />,
    children: [
      { path: "settings", element: <SettingsRoute /> },
      { path: "stats", element: <StatsRoute /> },
      { path: "report", element: <ReportRoute /> },
      { path: "techniques", element: <TechniquesRoute /> },
      { path: "guide", element: <Navigate to="/techniques" replace /> },
      { path: "about", element: <AboutRoute /> },
      { path: "shortcuts", element: <ShortcutsRoute /> },
      { path: "debug", element: <DebugRoute /> },
      { path: "techniques/new", element: <TechniqueEditorRoute /> },
      { path: "techniques/:id/edit", element: <TechniqueEditorRoute /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
