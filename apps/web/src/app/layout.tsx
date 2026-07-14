import "./globals.css";
import { Suspense } from "react";
import ProjectWorkspaceProvider from "@/components/layout";
import AppFrame from "@/components/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <ProjectWorkspaceProvider>
          <Suspense fallback={null}>
            <AppFrame>{children}</AppFrame>
          </Suspense>
        </ProjectWorkspaceProvider>
      </body>
    </html>
  );
}
