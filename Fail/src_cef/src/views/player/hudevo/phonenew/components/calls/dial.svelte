<!-- Добавляем после <script> если нет -->
import { addListernEvent } from "api/functions";

<!-- Ищем -->
<!-- let numberValue = ""; -->
<!-- Добавляем после -->
addListernEvent("phone.calls.dial.setTarget", (val) => numberValue = val);