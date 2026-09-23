resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_pet" "this" {
  length    = 3
  separator = "-"

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

# Signing key for helpdesk JWT access and refresh tokens
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# Initial password for the bootstrap admin (admin@acme.inc); must be changed on first login
resource "random_password" "admin_bootstrap" {
  length      = 20
  special     = false
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
}
