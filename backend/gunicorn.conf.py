import os

bind = f"0.0.0.0:{os.getenv('PORT', '1500')}"
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "600"))
threads = int(os.getenv("GUNICORN_THREADS", "2"))

# gunicorn -w 4 -b :1500 'app:create_app()' -c gunicorn.conf.ini  


# import multiprocessing

# bind = "142.93.75.243:1500"
# workers = multiprocessing.cpu_count() * 2 + 1
# timeout = 0
# threads = 2

# gunicorn -w 4 -b :1500 'app:create_app()' -c gunicorn.conf.ini
