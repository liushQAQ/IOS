# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')
p = r"C:/Program Files/DSH Desktop/resources/app/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
data = open(p, 'rb').read().decode('utf-8', 'replace')
i = data.find('const THINK_ICON')
print(data[i:i+3200])
