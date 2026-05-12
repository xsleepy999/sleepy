# Database Kampus

Script SQL untuk membuat database dan tabel di XAMPP (MySQL/MariaDB).

## Tabel yang tersedia

| No | Tabel | Kolom |
|----|-------|-------|
| 1 | `prodi` | kode_prodi, nama_prodi, akreditasi |
| 2 | `dosen` | nip, nama_dosen, angkatan_masuk, agama, jenis_kelamin |
| 3 | `mahasiswa` | nim, nama_mahasiswa, kelas, angkatan, agama |

## Cara Menjalankan

1. Buka **XAMPP Control Panel**, lalu start **Apache** dan **MySQL**
2. Buka browser, akses `http://localhost/phpmyadmin`
3. Klik tab **SQL** atau **Import**
4. Copy-paste isi file `database.sql` atau import file tersebut
5. Klik **Go** / **Execute**
