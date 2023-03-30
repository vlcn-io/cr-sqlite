rsync -vhra ./core/ ../libsql/ext/crr/ --include='**.gitignore' --exclude='**.git' --filter=':- .gitignore' --delete-after
