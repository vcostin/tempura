import { RouterProvider } from "react-router";
import { WindowControls } from "./components/WindowControls";
import { router } from "./router";
import { AppStateProvider } from "./state/AppState";
import "./styles/fonts.css";
import "./styles/global.css";

export default function App() {
  return (
    <AppStateProvider>
      <WindowControls />
      <RouterProvider router={router} />
    </AppStateProvider>
  );
}
