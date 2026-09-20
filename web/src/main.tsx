import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { env } from "./env";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { SignInPage, SignUpPage } from "./pages/Auth";
import { Account } from "./pages/Account";
import { Privacy } from "./pages/Privacy";
import { Support } from "./pages/Support";
import "./styles.css";

const convex = new ConvexReactClient(env.convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClerkProvider publishableKey={env.clerkPublishableKey} afterSignOutUrl="/">
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="sign-in/*" element={<SignInPage />} />
              <Route path="sign-up/*" element={<SignUpPage />} />
              <Route path="account" element={<Account />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="support" element={<Support />} />
            </Route>
          </Routes>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
