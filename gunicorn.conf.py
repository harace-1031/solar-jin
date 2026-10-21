import os
bind='0.0.0.0:'+os.getenv('PORT','10000')
workers=1
worker_class='gthread'
threads=8
timeout=180
accesslog=None
errorlog='-'
