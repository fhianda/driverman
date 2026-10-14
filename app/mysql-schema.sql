CREATE TABLE IF NOT EXISTS app_write_lock (
    id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL
) ENGINE=InnoDB;
INSERT INTO app_write_lock(id,schema_version) VALUES(1,1) ON DUPLICATE KEY UPDATE id=id;
CREATE TABLE IF NOT EXISTS drivers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, phone VARCHAR(40) NOT NULL,
    license VARCHAR(50) NOT NULL, license_expiry VARCHAR(10) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'available', deleted_at VARCHAR(19),
    UNIQUE KEY drivers_license (license), CHECK(status IN ('available','offline'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vehicles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, plate VARCHAR(30) NOT NULL, make VARCHAR(60) NOT NULL,
    model VARCHAR(60) NOT NULL, type VARCHAR(60) NOT NULL, fuel VARCHAR(20) NOT NULL,
    mileage BIGINT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'available', deleted_at VARCHAR(19),
    UNIQUE KEY vehicles_plate (plate), CHECK(mileage>=0), CHECK(status IN ('available','maintenance'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, email VARCHAR(150) NOT NULL,
    password VARCHAR(255) NOT NULL, role VARCHAR(16) NOT NULL DEFAULT 'admin', driver_id BIGINT,
    UNIQUE KEY users_email (email), UNIQUE KEY users_driver_id (driver_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id), CHECK(role IN ('admin','driver'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS login_attempts (
    address VARCHAR(100) PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, reset_at BIGINT NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, driver_id BIGINT NOT NULL, vehicle_id BIGINT NOT NULL,
    destination VARCHAR(150) NOT NULL, purpose VARCHAR(60) NOT NULL, start_at VARCHAR(19) NOT NULL,
    expected_return VARCHAR(19) NOT NULL, start_km BIGINT NOT NULL, end_at VARCHAR(19), end_km BIGINT,
    notes TEXT NOT NULL DEFAULT (''),
    active_driver_id BIGINT GENERATED ALWAYS AS (CASE WHEN end_at IS NULL THEN driver_id ELSE NULL END) STORED INVISIBLE,
    active_vehicle_id BIGINT GENERATED ALWAYS AS (CASE WHEN end_at IS NULL THEN vehicle_id ELSE NULL END) STORED INVISIBLE,
    UNIQUE KEY one_active_driver (active_driver_id), UNIQUE KEY one_active_vehicle (active_vehicle_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id), FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CHECK(start_km>=0), CHECK(end_km IS NULL OR end_km>=start_km), CHECK(end_at IS NULL OR end_at>=start_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS resource_photos (
    resource_type VARCHAR(10) NOT NULL, resource_id BIGINT NOT NULL, version VARCHAR(64) NOT NULL,
    content MEDIUMBLOB NOT NULL, PRIMARY KEY(resource_type,resource_id), CHECK(resource_type IN ('driver','vehicle'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS refuelings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, vehicle_id BIGINT NOT NULL, filled_at VARCHAR(19) NOT NULL,
    mileage BIGINT NOT NULL, liters_ml BIGINT NOT NULL, unit_price_milli BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL, full_tank INTEGER NOT NULL DEFAULT 0,
    latitude DOUBLE, longitude DOUBLE, accuracy DOUBLE, station VARCHAR(150) NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT (''), created_by BIGINT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY refuelings_vehicle_date (vehicle_id,filled_at), FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CHECK(mileage>=0), CHECK(liters_ml>0), CHECK(unit_price_milli>=0), CHECK(currency IN ('USD','CDF')),
    CHECK(full_tank IN (0,1)),
    CHECK((latitude IS NULL AND longitude IS NULL AND accuracy IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND (accuracy IS NULL OR accuracy>=0)))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mobile_tokens (
    token_hash VARCHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS app_settings (name VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id BIGINT NOT NULL, event VARCHAR(20) NOT NULL, mode VARCHAR(10) NOT NULL,
    PRIMARY KEY(user_id,event), CHECK(event IN ('departure','fuel')), CHECK(mode IN ('off','sound','vibrate','both','silent'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL, event VARCHAR(20) NOT NULL,
    source_id BIGINT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at BIGINT NOT NULL, read_at BIGINT,
    UNIQUE KEY notifications_source (user_id,event,source_id), KEY notifications_user_date (user_id,id DESC)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS push_devices (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL, kind VARCHAR(10) NOT NULL,
    address_hash VARCHAR(64) NOT NULL, subscription TEXT NOT NULL, binding VARCHAR(80) NOT NULL, updated_at BIGINT NOT NULL,
    UNIQUE KEY push_address (address_hash), CHECK(kind IN ('web','android'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS push_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, notification_id BIGINT NOT NULL, device_id BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, next_at BIGINT NOT NULL, lease_until BIGINT NOT NULL DEFAULT 0,
    state VARCHAR(20) NOT NULL DEFAULT 'pending', last_error TEXT,
    UNIQUE KEY push_delivery (notification_id,device_id),
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES push_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movement_positions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, movement_id BIGINT NOT NULL, sample_id VARCHAR(36) NOT NULL,
    segment_id VARCHAR(36) NOT NULL, recorded_at BIGINT NOT NULL, latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL, accuracy DOUBLE NOT NULL, created_by BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY position_sample (movement_id,sample_id), KEY positions_movement_time (movement_id,recorded_at,id),
    FOREIGN KEY (movement_id) REFERENCES movements(id), CHECK(latitude BETWEEN -90 AND 90),
    CHECK(longitude BETWEEN -180 AND 180), CHECK(accuracy>0 AND accuracy<=50)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS movement_routes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, movement_id BIGINT NOT NULL, file_hash VARCHAR(64) NOT NULL,
    name VARCHAR(200) NOT NULL, format VARCHAR(20) NOT NULL, segments_json LONGTEXT NOT NULL,
    point_count INTEGER NOT NULL, created_by BIGINT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY route_file (movement_id,file_hash), FOREIGN KEY (movement_id) REFERENCES movements(id)
) ENGINE=InnoDB;
