import React, { PropsWithChildren } from "react";

export default function Layout({ children }: PropsWithChildren) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>RapidREST: Admin Console</title>
                <link rel="icon" href="/favicon.ico" />
                <link rel="stylesheet" href="/styles/globals.css" />
            </head>
            <body>{children}</body>
        </html>
    );
}
