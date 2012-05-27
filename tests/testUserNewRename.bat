cls
curl -L %* http://localhost:8124/ -d "{{{"
curl -L %* http://localhost:8124/123456/user/rename
curl -L %* http://localhost:8124/123456/user/rename -d "{\"name\":\"Joe\"}"
curl -L %* http://localhost:8124/123456/user/rename

