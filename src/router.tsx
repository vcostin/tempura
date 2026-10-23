import { createHashRouter, Navigate } from "react-router";
import {
  AboutRoute,
  DebugRoute,
  GuideRoute,
  SettingsRoute,
  StatsRoute,
  TechniqueEditorRoute,
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
      { path: "guide", element: <GuideRoute /> },
      { path: "about", element: <AboutRoute /> },
      { path: "debug", element: <DebugRoute /> },
      { path: "techniques/new", element: <TechniqueEditorRoute /> },
      { path: "techniques/:id/edit", element: <TechniqueEditorRoute /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
