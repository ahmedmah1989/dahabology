# Review-gated automatic publication

This workflow builds and tests pull requests without deployment credentials. A merge to main builds and deploys the reviewed main branch to GitHub Pages. It does not merge PRs or approve its own changes.

Before activation, the owner must approve this PR. After the approved merge, change Settings > Pages > Source from branch publication to GitHub Actions and run Deploy Dahabology site for main. Confirm the returned deployment URL and live assets. PR1 chart fixes are merged in main but not yet published by the previous manual gh-pages process.

The workflow uses the existing repository path /dahabology. A future custom domain requires a separate reviewed SITE_URL/BASE_PATH change. Every later code change still requires a PR and the owner's explicit OK before merge. Never enable auto-merge.

The test command includes both JavaScript and cjs regressions. A test or build failure blocks publication. No paid service, new credential, or secret is required.
