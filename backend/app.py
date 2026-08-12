import os
from flask import Flask
from flask_cors import CORS
from routes import routes_bp, init_db


def create_app():
    app = Flask(__name__)
    allowed_origins = os.getenv(
        'CORS_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000'
    ).split(',')
    CORS(app, origins=[origin.strip() for origin in allowed_origins if origin.strip()])

    app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    init_db()
    app.register_blueprint(routes_bp)

    @app.get('/health')
    def health():
        return {'status': 'ok'}
    
    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
