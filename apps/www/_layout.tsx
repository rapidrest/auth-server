import React, { PropsWithChildren } from "react";
import ElevationHost from "../shared/components/elevation/ElevationHost.js";

export default function Layout({ children }: PropsWithChildren) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>RapidREST</title>
                <link rel="icon" href="/favicon.ico" />
                <link rel="stylesheet" href="/styles/globals.css" />
            </head>
            <body>
                {children}
                <ElevationHost />
            </body>
        </html>
    );
}
