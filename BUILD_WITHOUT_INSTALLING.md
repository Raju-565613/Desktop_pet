# Build the app without installing anything on your computer

This gets you a real `.exe` installer that anyone can download and run —
zero installs for them, and zero installs for *you* either. GitHub builds
it for you, for free, on a real Windows machine in the cloud.

## What you need

Just a free GitHub account (github.com — sign up if you don't have one).
Nothing installs on your computer for this.

## Steps

1. **Create a new repository.**
   Go to github.com → click the **+** in the top right → **New repository**.
   Name it anything (e.g. `desktop-pet`). Leave it Public or Private, either
   works. Don't check "Add a README" — click **Create repository**.

2. **Upload the project files.**
   On the empty repo's page, click **"uploading an existing file"**
   (a link in the setup instructions GitHub shows you).
   Drag the *entire contents* of this unzipped `desktop-pet` folder into the
   upload box — all of it: `src`, `src-tauri`, `.github`, `package.json`,
   everything. Modern browsers (Chrome/Edge) let you drag whole folders in,
   not just individual files. Scroll down, click **Commit changes**.

3. **Wait for the build.**
   Click the **Actions** tab at the top of your repo. You should see a
   workflow run called "Build Windows Installer" already running (it starts
   automatically the moment you upload). Click into it to watch progress.
   This takes **10-20 minutes** the first time — GitHub is compiling the
   entire Rust toolchain from scratch on their machine, not yours.

4. **Download the installer.**
   Once the run shows a green checkmark, scroll to the bottom of that run's
   page to **Artifacts**. Click **desktop-pet-windows-installer** to
   download a zip containing the real `.exe` installer.

5. **That `.exe` is the finished product.**
   Anyone — including you — can now double-click it, click through the
   installer, and the app is installed and running. No Rust, no Node, no
   command line, ever, for them.

## If the build fails (red X instead of green check)

Click into the failed run, then click the **"Build the Windows installer"**
step to expand the error log. Copy the error text (especially the first
`error[EXXXX]:` you see) and send it to me — I'll fix the source code
directly. This is exactly the kind of issue the README's "Rust verification
notes" section anticipated, since I was never able to compile this code
myself before handing it to you.

## After the first successful build

Every time you upload changed files (or I send you updated files to
re-upload), the workflow reruns automatically and produces a fresh
installer — you never have to repeat the setup, just re-upload and wait for
the green checkmark.
