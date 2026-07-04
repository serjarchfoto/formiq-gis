import "./globals.css";
import ProjectWorkspaceProvider from "@/components/layout";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <ProjectWorkspaceProvider>{children}</ProjectWorkspaceProvider>
      </body>
    </html>
  );
}
