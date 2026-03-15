#!/bin/bash

set -e

# When building on Cloudflare Pages, use the deployment URL as the base URL.
# This ensures preview environments use their own URL rather than the production URL.
# CF_PAGES_URL is set by Cloudflare Pages for every deployment (both preview and production).
if [ -n "$CF_PAGES_URL" ]; then
    hugo --baseURL "$CF_PAGES_URL"
else
    hugo
fi
